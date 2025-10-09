const { AgentConfig } = require('../models/AgentConfig');
const ClaudeConversation = require('../models/ClaudeConversation');
const Task = require('../models/Task');
const claudeService = require('../services/claudeService');

// @desc    Generate task suggestions from conversation sources
// @route   POST /api/conversations/:id/generate-tasks
// @access  Private
exports.generateTasks = async (req, res) => {
  try {
    const conversationId = req.params.id;

    // Load the conversation with sources
    const conversation = await ClaudeConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get task generation agent config
    const config = await AgentConfig.findOne({ type: 'create-tasks' });
    if (!config) {
      console.error('Task generation agent not configured');
      return res.status(500).json({ error: 'Task generation agent not configured' });
    }

    console.log(`Task generation started for conversation ${conversationId}`);
    console.log(`Total sources in conversation: ${conversation.sources?.length || 0}`);

    // Note: Sources are already pre-filtered by the initial Claude analysis
    // User selected how many sources to analyze (10-100), so they're all relevant
    // We'll analyze all of them to maximize task discovery
    if (!conversation.sources || conversation.sources.length === 0) {
      return res.json({
        success: true,
        message: 'No sources found for task generation',
        suggestedTasks: []
      });
    }

    // Deduplicate sources by deeplink to avoid analyzing the same post multiple times
    const seenDeeplinks = new Set();
    const uniqueSources = conversation.sources.filter(source => {
      if (!source.deeplink) return true; // Keep sources without deeplinks

      if (seenDeeplinks.has(source.deeplink)) {
        return false; // Skip duplicate
      }

      seenDeeplinks.add(source.deeplink);
      return true;
    });

    console.log(`Total sources: ${conversation.sources.length}, Unique sources after deduplication: ${uniqueSources.length}`);

    const sourcesToAnalyze = uniqueSources;

    const suggestedTasks = [];
    const analysisReport = [];
    let processedCount = 0;
    let filteredByHaiku = 0;
    let analyzedBySonnet = 0;

    // Emit initial status
    if (global.io) {
      global.io.emit('task-generation:started', {
        userId: req.user._id.toString(),
        conversationId: conversationId,
        totalSources: sourcesToAnalyze.length
      });
    }

    // Analyze each source
    for (const source of sourcesToAnalyze) {
      try {
        // Emit progress - Stage 1: Haiku
        if (global.io) {
          global.io.emit('task-generation:progress', {
            userId: req.user._id.toString(),
            conversationId: conversationId,
            current: processedCount + 1,
            total: sourcesToAnalyze.length,
            platform: source.platform,
            author: source.author,
            stage: 'haiku',
            model: 'Claude 3.5 Haiku'
          });
        }

        // STAGE 1: Quick filter with Haiku
        const filterResult = await claudeService.quickFilterWithHaiku(source);

        // If Haiku says skip, add to report and continue to next source
        if (!filterResult.shouldAnalyze) {
          filteredByHaiku++;
          analysisReport.push({
            sourceId: source.id,
            platform: source.platform,
            author: source.author,
            contentSnippet: source.content ? source.content.substring(0, 200) : '',
            sourceDeeplink: source.deeplink,
            score: 0,
            shouldEngage: false,
            reasoning: `Filtered by Haiku: ${filterResult.reason} (App type: ${filterResult.appType})`,
            isComment: source.metadata?.is_comment || false,
            relevanceScore: source.relevanceScore,
            analyzedAt: new Date(),
            filteredStage: 'haiku'
          });
          processedCount++;
          continue;
        }

        // STAGE 2: Full analysis with Sonnet (only for posts that passed Haiku filter)
        analyzedBySonnet++;

        // Emit progress - Stage 2: Sonnet
        if (global.io) {
          global.io.emit('task-generation:progress', {
            userId: req.user._id.toString(),
            conversationId: conversationId,
            current: processedCount + 1,
            total: sourcesToAnalyze.length,
            platform: source.platform,
            author: source.author,
            stage: 'sonnet',
            model: 'Claude Sonnet 4.5'
          });
        }

        // Build post content for analysis (cached method separates static from variable content)
        const postContent = buildPostContentForCache(
          conversation.question,
          conversation.answer,
          source
        );

        // Call Claude Sonnet with prompt caching (instructions + valueProps cached)
        const response = await claudeService.analyzeForTaskWithCache(
          config.instructions,
          config.valuePropositions,
          postContent
        );

        // Parse the response
        const taskAnalysis = parseTaskAnalysisResponse(response.text);

        // Log score result with response type
        if (taskAnalysis) {
          const responseTypeLabel = taskAnalysis.responseType
            ? ` (${taskAnalysis.responseType})`
            : '';
          if (taskAnalysis.shouldEngage) {
            console.log(`[${processedCount + 1}/${sourcesToAnalyze.length}] ✅ Score: ${taskAnalysis.score}/12${responseTypeLabel} - Task suggestion created`);
          } else {
            console.log(`[${processedCount + 1}/${sourcesToAnalyze.length}] ❌ Score: ${taskAnalysis.score}/12 - Skipped (below threshold)`);
          }
        }

        // Add to analysis report (ALL sources, not just engaged ones)
        if (taskAnalysis) {
          analysisReport.push({
            sourceId: source.id,
            platform: source.platform,
            author: source.author,
            contentSnippet: source.content ? source.content.substring(0, 200) : '',
            sourceDeeplink: source.deeplink,
            score: taskAnalysis.score,
            shouldEngage: taskAnalysis.shouldEngage,
            responseType: taskAnalysis.responseType || null,
            reasoning: taskAnalysis.reasoning,
            isComment: source.metadata?.is_comment || false,
            relevanceScore: source.relevanceScore,
            analyzedAt: new Date()
          });
        }

        // Only add to suggested tasks if should engage
        if (taskAnalysis && taskAnalysis.shouldEngage) {
          // Check if task with same deeplink already exists
          let existingTask = null;
          let isDuplicate = false;

          if (source.deeplink) {
            existingTask = await Task.findOne({ sourceUrl: source.deeplink });
            isDuplicate = !!existingTask;
          }

          suggestedTasks.push({
            sourceId: source.id,
            sourceContent: source.content,
            sourceDeeplink: source.deeplink,
            platform: source.platform,
            author: source.author,
            shouldEngage: taskAnalysis.shouldEngage,
            score: taskAnalysis.score,
            responseType: taskAnalysis.responseType || null,
            reasoning: taskAnalysis.reasoning,
            suggestedResponse: taskAnalysis.suggestedResponse,
            relevanceScore: source.relevanceScore,
            status: 'pending',
            isDuplicate: isDuplicate,
            existingTaskId: existingTask?._id,
            generatedAt: new Date()
          });
        }

        processedCount++;
      } catch (error) {
        console.error(`Error analyzing source ${source.id}:`, error);
        // Continue with next source
      }
    }

    // Save suggested tasks and analysis report to conversation
    conversation.suggestedTasks = suggestedTasks;
    conversation.taskGenerationReport = analysisReport;
    conversation.tasksGeneratedAt = new Date();
    conversation.tasksGeneratedBy = req.user._id;
    await conversation.save();

    // Count duplicates
    const duplicateCount = suggestedTasks.filter(t => t.isDuplicate).length;

    // Calculate filter efficiency
    const filterEfficiency = sourcesToAnalyze.length > 0
      ? ((filteredByHaiku / sourcesToAnalyze.length) * 100).toFixed(1)
      : 0;

    // Emit completion
    if (global.io) {
      global.io.emit('task-generation:complete', {
        userId: req.user._id.toString(),
        conversationId: conversationId,
        tasksGenerated: suggestedTasks.length,
        filteredByHaiku: filteredByHaiku,
        analyzedBySonnet: analyzedBySonnet,
        filterEfficiency: `${filterEfficiency}%`
      });
    }

    console.log(`\n=== Two-Stage Filter Results ===`);
    console.log(`Total sources: ${sourcesToAnalyze.length}`);
    console.log(`Filtered by Haiku (Stage 1): ${filteredByHaiku} (${filterEfficiency}%)`);
    console.log(`Analyzed by Sonnet (Stage 2): ${analyzedBySonnet}`);
    console.log(`Tasks generated: ${suggestedTasks.length}`);
    console.log(`Estimated cost savings: ~${filterEfficiency}% reduction in Sonnet calls`);
    console.log(`================================\n`);

    res.json({
      success: true,
      suggestedTasks,
      totalAnalyzed: sourcesToAnalyze.length,
      tasksGenerated: suggestedTasks.length,
      duplicateCount: duplicateCount,
      filterMetrics: {
        filteredByHaiku,
        analyzedBySonnet,
        filterEfficiency: `${filterEfficiency}%`,
        estimatedCostSavings: `~${filterEfficiency}% reduction in Sonnet calls`
      }
    });

  } catch (error) {
    console.error('Generate tasks error:', error);

    if (global.io) {
      global.io.emit('task-generation:error', {
        userId: req.user._id.toString(),
        conversationId: req.params.id,
        error: error.message
      });
    }

    res.status(500).json({ error: 'Error generating tasks: ' + error.message });
  }
};

// @desc    Create actual task from suggestion
// @route   POST /api/conversations/:id/tasks/:taskIndex/create
// @access  Private
exports.createTaskFromSuggestion = async (req, res) => {
  try {
    const { id, taskIndex } = req.params;
    const { title, description, priority } = req.body;

    const conversation = await ClaudeConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const suggestedTask = conversation.suggestedTasks[parseInt(taskIndex)];
    if (!suggestedTask) {
      return res.status(404).json({ error: 'Suggested task not found' });
    }

    // Map platform names to match Task model enum
    const platformMap = {
      'lovable': 'Discord',
      'v0': 'Discord',
      'discord': 'Discord',
      'reddit': 'Reddit',
      'x': 'X',
      'twitter': 'X',
      'linkedin': 'LinkedIn'
    };

    const mappedPlatform = platformMap[suggestedTask.platform?.toLowerCase()] || 'Discord';

    // Generate AI title if not provided
    let taskTitle = title;
    if (!taskTitle) {
      try {
        const contentForTitle = suggestedTask.sourceContent || suggestedTask.reasoning || '';
        const titlePrompt = `${suggestedTask.author} on ${suggestedTask.platform}: ${contentForTitle.substring(0, 200)}`;
        taskTitle = await claudeService.generateTitle(titlePrompt);
      } catch (error) {
        console.error('Error generating task title:', error);
        // Fallback to original format
        taskTitle = `${suggestedTask.platform} - ${suggestedTask.author}`;
      }
    }

    // Find the original source to get timestamp
    const originalSource = conversation.sources.find(s => s.id === suggestedTask.sourceId);

    let task;

    // If this is a duplicate, update the existing task instead of creating new one
    if (suggestedTask.isDuplicate && suggestedTask.existingTaskId) {
      task = await Task.findById(suggestedTask.existingTaskId);

      if (task) {
        // Update existing task with new information
        task.title = taskTitle;
        task.snippet = suggestedTask.sourceContent || suggestedTask.reasoning;
        task.priority = priority || (suggestedTask.score >= 10 ? 'high' : suggestedTask.score >= 7 ? 'medium' : 'low');
        task.suggestedResponse = suggestedTask.suggestedResponse;
        task.reasoning = suggestedTask.reasoning;
        task.metadata = {
          ...task.metadata,
          author: suggestedTask.author,
          timestamp: originalSource?.timestamp,
          conversationId: conversation._id,
          originalPlatform: suggestedTask.platform,
          score: suggestedTask.score,
          responseType: suggestedTask.responseType || null
        };
        await task.save();
      } else {
        // Fallback if existing task not found - create new one
        task = await Task.create({
          title: taskTitle,
          snippet: suggestedTask.sourceContent || suggestedTask.reasoning,
          sourceUrl: suggestedTask.sourceDeeplink || '#',
          platform: mappedPlatform,
          intent: 'engagement',
          priority: priority || (suggestedTask.score >= 10 ? 'high' : suggestedTask.score >= 7 ? 'medium' : 'low'),
          suggestedResponse: suggestedTask.suggestedResponse,
          reasoning: suggestedTask.reasoning,
          metadata: {
            author: suggestedTask.author,
            timestamp: originalSource?.timestamp,
            conversationId: conversation._id,
            originalPlatform: suggestedTask.platform,
            score: suggestedTask.score,
            responseType: suggestedTask.responseType || null
          }
        });
      }
    } else {
      // Create new task
      task = await Task.create({
        title: taskTitle,
        snippet: suggestedTask.sourceContent || suggestedTask.reasoning,
        sourceUrl: suggestedTask.sourceDeeplink || '#',
        platform: mappedPlatform,
        intent: 'engagement',
        priority: priority || (suggestedTask.score >= 10 ? 'high' : suggestedTask.score >= 7 ? 'medium' : 'low'),
        suggestedResponse: suggestedTask.suggestedResponse,
        reasoning: suggestedTask.reasoning,
        metadata: {
          author: suggestedTask.author,
          timestamp: originalSource?.timestamp,
          conversationId: conversation._id,
          originalPlatform: suggestedTask.platform,
          score: suggestedTask.score
        }
      });
    }

    // Update suggested task status
    conversation.suggestedTasks[parseInt(taskIndex)].status = 'created';
    conversation.suggestedTasks[parseInt(taskIndex)].createdTaskId = task._id;
    await conversation.save();

    // Emit socket event for real-time update
    if (global.io) {
      global.io.emit('task:created', {
        taskId: task._id.toString()
      });
    }

    res.json({
      success: true,
      task
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Error creating task: ' + error.message });
  }
};

// @desc    Update suggested task (edit response)
// @route   PATCH /api/conversations/:id/tasks/:taskIndex
// @access  Private
exports.updateSuggestedTask = async (req, res) => {
  try {
    const { id, taskIndex } = req.params;
    const { suggestedResponse } = req.body;

    const conversation = await ClaudeConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!conversation.suggestedTasks[parseInt(taskIndex)]) {
      return res.status(404).json({ error: 'Suggested task not found' });
    }

    const task = conversation.suggestedTasks[parseInt(taskIndex)];

    // Save current version to history before updating
    if (task.suggestedResponse) {
      if (!task.responseVersions) {
        task.responseVersions = [];
      }

      task.responseVersions.push({
        content: task.suggestedResponse,
        savedAt: new Date(),
        versionNumber: task.currentVersion || 1
      });
    }

    // Update to new version
    task.suggestedResponse = suggestedResponse;
    task.currentVersion = (task.currentVersion || 1) + 1;

    await conversation.save();

    res.json({
      success: true,
      task: conversation.suggestedTasks[parseInt(taskIndex)]
    });

  } catch (error) {
    console.error('Update suggested task error:', error);
    res.status(500).json({ error: 'Error updating task: ' + error.message });
  }
};

// @desc    Reject/skip suggested task
// @route   DELETE /api/conversations/:id/tasks/:taskIndex
// @access  Private
exports.rejectSuggestedTask = async (req, res) => {
  try {
    const { id, taskIndex } = req.params;

    const conversation = await ClaudeConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!conversation.suggestedTasks[parseInt(taskIndex)]) {
      return res.status(404).json({ error: 'Suggested task not found' });
    }

    conversation.suggestedTasks[parseInt(taskIndex)].status = 'rejected';
    await conversation.save();

    res.json({
      success: true,
      message: 'Task suggestion rejected'
    });

  } catch (error) {
    console.error('Reject task error:', error);
    res.status(500).json({ error: 'Error rejecting task: ' + error.message });
  }
};

// Helper function to build the task generation prompt (legacy - kept for reference)
function buildTaskGenerationPrompt(instructions, valuePropositions, question, answer, source) {
  return `${instructions}

## WEAVY CONTEXT:
${valuePropositions}

## SUMMARY REPORT:
**Question:** ${question}

**Analysis:** ${answer}

## POST TO ANALYZE:
**Platform:** ${source.platform}
**Author:** ${source.author}
**Content:** ${source.content}
**Link:** ${source.deeplink}
**Relevance Score:** ${source.relevanceScore}

---

Please analyze this post using the scoring framework provided in the instructions above.

Return your analysis in the following JSON format:
{
  "shouldEngage": true/false,
  "score": <number out of 12>,
  "responseType": "pure-help" | "help-with-sprinkle" | "strong-fit",
  "reasoning": "<1-2 sentences explaining your decision>",
  "suggestedResponse": "<the response text if engaging, or empty string if not>"
}`;
}

// Helper function to build post content for cached analysis
// Instructions + value props are sent as cached system messages
function buildPostContentForCache(question, answer, source) {
  return `## SUMMARY REPORT:
**Question:** ${question}

**Analysis:** ${answer}

## POST TO ANALYZE:
**Platform:** ${source.platform}
**Author:** ${source.author}
**Content:** ${source.content}
**Link:** ${source.deeplink}
**Relevance Score:** ${source.relevanceScore}

---

Please analyze this post using the scoring framework provided in the instructions above.

Return your analysis in the following JSON format:
{
  "shouldEngage": true/false,
  "score": <number out of 12>,
  "responseType": "pure-help" | "help-with-sprinkle" | "strong-fit",
  "reasoning": "<1-2 sentences explaining your decision>",
  "suggestedResponse": "<the response text if engaging, or empty string if not>"
}`;
}

// Helper function to parse Claude's response
function parseTaskAnalysisResponse(response) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: try to parse the whole response
    return JSON.parse(response);
  } catch (error) {
    console.error('Error parsing task analysis response:', error);
    return null;
  }
}

module.exports = exports;
