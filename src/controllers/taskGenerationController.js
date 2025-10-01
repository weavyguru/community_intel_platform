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
      return res.status(500).json({ error: 'Task generation agent not configured' });
    }

    // Filter sources by relevance (only analyze high-relevance sources)
    const relevanceThreshold = 0.7;
    const highRelevanceSources = conversation.sources.filter(
      source => source.relevanceScore >= relevanceThreshold
    );

    if (highRelevanceSources.length === 0) {
      return res.json({
        success: true,
        message: 'No high-relevance sources found for task generation',
        suggestedTasks: []
      });
    }

    // Limit to max 15 sources to avoid overwhelming
    const sourcesToAnalyze = highRelevanceSources.slice(0, 15);

    const suggestedTasks = [];
    let processedCount = 0;

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
        // Build prompt for this specific source
        const prompt = buildTaskGenerationPrompt(
          config.instructions,
          config.valuePropositions,
          conversation.question,
          conversation.answer,
          source
        );

        // Emit progress
        if (global.io) {
          global.io.emit('task-generation:progress', {
            userId: req.user._id.toString(),
            conversationId: conversationId,
            current: processedCount + 1,
            total: sourcesToAnalyze.length,
            platform: source.platform,
            author: source.author
          });
        }

        // Call Claude to analyze this source
        const response = await claudeService.analyzeForTask(prompt);

        // Parse the response
        const taskAnalysis = parseTaskAnalysisResponse(response);

        // Only add if should engage
        if (taskAnalysis && taskAnalysis.shouldEngage) {
          suggestedTasks.push({
            sourceId: source.id,
            sourceContent: source.content,
            sourceDeeplink: source.deeplink,
            platform: source.platform,
            author: source.author,
            shouldEngage: taskAnalysis.shouldEngage,
            score: taskAnalysis.score,
            reasoning: taskAnalysis.reasoning,
            suggestedResponse: taskAnalysis.suggestedResponse,
            relevanceScore: source.relevanceScore,
            status: 'pending',
            generatedAt: new Date()
          });
        }

        processedCount++;
      } catch (error) {
        console.error(`Error analyzing source ${source.id}:`, error);
        // Continue with next source
      }
    }

    // Save suggested tasks to conversation
    conversation.suggestedTasks = suggestedTasks;
    conversation.tasksGeneratedAt = new Date();
    conversation.tasksGeneratedBy = req.user._id;
    await conversation.save();

    // Emit completion
    if (global.io) {
      global.io.emit('task-generation:complete', {
        userId: req.user._id.toString(),
        conversationId: conversationId,
        tasksGenerated: suggestedTasks.length
      });
    }

    res.json({
      success: true,
      suggestedTasks,
      totalAnalyzed: sourcesToAnalyze.length,
      tasksGenerated: suggestedTasks.length
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

    // Create the actual task
    const task = await Task.create({
      title: title || `${suggestedTask.platform} - ${suggestedTask.author}`,
      description: description || suggestedTask.suggestedResponse,
      platform: suggestedTask.platform,
      deeplink: suggestedTask.sourceDeeplink,
      intent: 'engagement',
      priority: priority || (suggestedTask.score >= 10 ? 'high' : suggestedTask.score >= 7 ? 'medium' : 'low'),
      assignedTo: req.user._id,
      metadata: {
        sourceContent: suggestedTask.sourceContent,
        reasoning: suggestedTask.reasoning,
        conversationId: conversation._id
      }
    });

    // Update suggested task status
    conversation.suggestedTasks[parseInt(taskIndex)].status = 'created';
    conversation.suggestedTasks[parseInt(taskIndex)].createdTaskId = task._id;
    await conversation.save();

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

    conversation.suggestedTasks[parseInt(taskIndex)].suggestedResponse = suggestedResponse;
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

// Helper function to build the task generation prompt
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
