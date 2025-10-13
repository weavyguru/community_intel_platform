const cron = require('node-cron');
const chromaService = require('../services/chromaService');
const claudeService = require('../services/claudeService');
const { AgentConfig } = require('../models/AgentConfig');
const ClaudeConversation = require('../models/ClaudeConversation');
const Task = require('../models/Task');
const JobRunHistory = require('../models/JobRunHistory');
const User = require('../models/User');
const AnalyzedPost = require('../models/AnalyzedPost');
const emailService = require('../services/emailService');

class IntelligenceJob {
  constructor() {
    this.isRunning = false;
    this.lastSuccessfulRun = null;
    this.intervalHours = 4; // Default: Job runs every 4 hours
    this.lookbackHours = 48; // Default: Look back 48 hours in content timestamps
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalTasksCreated: 0,
      totalItemsProcessed: 0
    };
    this.runHistory = []; // Keep last 50 runs in memory for quick access
    this.maxHistorySize = 50;

    // Load stats and history from DB on initialization
    this.initializeFromDatabase();
  }

  async initializeFromDatabase() {
    try {
      // Load last 50 runs from DB into memory
      const runs = await JobRunHistory.find()
        .sort({ timestamp: -1 })
        .limit(this.maxHistorySize)
        .lean();

      this.runHistory = runs.reverse(); // Oldest first in array

      // Calculate stats from DB
      const allRuns = await JobRunHistory.find().lean();
      this.stats.totalRuns = allRuns.length;
      this.stats.successfulRuns = allRuns.filter(r => r.success).length;
      this.stats.failedRuns = allRuns.filter(r => !r.success).length;
      this.stats.totalTasksCreated = allRuns.reduce((sum, r) => sum + (r.result?.tasksCreated || 0), 0);
      this.stats.totalItemsProcessed = allRuns.reduce((sum, r) => sum + (r.result?.processed || 0), 0);

      // Get last successful run timestamp
      const lastSuccess = allRuns.find(r => r.success);
      if (lastSuccess) {
        this.lastSuccessfulRun = new Date(lastSuccess.timestamp);
      }

      console.log(`Loaded ${this.runHistory.length} runs from database`);
    } catch (error) {
      console.error('Error loading job history from database:', error);
    }
  }

  start(intervalHours = null) {
    if (intervalHours) {
      this.intervalHours = intervalHours;
    }

    // Build cron expression based on interval
    const cronExpression = `0 */${this.intervalHours} * * *`;

    this.job = cron.schedule(cronExpression, async () => {
      await this.execute();
    });

    console.log(`Intelligence job scheduled: Runs every ${this.intervalHours} hours (${cronExpression})`);
    return this.job;
  }

  updateInterval(hours) {
    if (this.job) {
      this.job.stop();
    }
    this.intervalHours = hours;
    this.start();
    console.log(`Intelligence job interval updated to ${hours} hours`);
  }

  async execute(isManual = false, customLookbackHours = null) {
    if (this.isRunning) {
      console.log('Intelligence job already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.stats.totalRuns++;

    const jobStartTime = Date.now();
    const jobTimestamp = new Date();

    // Use custom lookback hours if provided, otherwise use default
    const lookbackHours = customLookbackHours !== null ? customLookbackHours : this.lookbackHours;

    console.log('='.repeat(60));
    console.log('Intelligence Job Execution Started');
    console.log(`Time: ${jobTimestamp.toISOString()}`);
    console.log(`Mode: ${isManual ? 'Manual' : 'Scheduled'}`);
    if (customLookbackHours !== null) {
      console.log(`Custom Lookback: ${lookbackHours} hours`);
    }
    console.log('='.repeat(60));

    // Helper to emit status updates
    const emitStatus = (message, detail = '') => {
      console.log(detail || message);
      if (global.io) {
        console.log('[Socket.IO] Emitting job:status:', message);
        global.io.emit('job:status', {
          message,
          detail,
          timestamp: new Date()
        });
      } else {
        console.log('[Socket.IO] WARNING: global.io not available');
      }
    };

    try {
      // STEP 1: Get time range
      // Always look back {lookbackHours} hours based on content timestamp_unix
      // This ensures we catch recently imported historical content
      const endDate = new Date();
      const lookbackMs = lookbackHours * 60 * 60 * 1000;
      const startDate = new Date(endDate.getTime() - lookbackMs);

      const timeRangeMsg = `Time range (content timestamps): ${startDate.toISOString()} to ${endDate.toISOString()}`;
      const lookbackMsg = `Lookback: ${lookbackHours} hours (catches historical content imported recently)`;
      const scheduleMsg = `Schedule: Job runs every ${this.intervalHours} hours`;
      console.log(timeRangeMsg);
      console.log(lookbackMsg);
      console.log(scheduleMsg);
      emitStatus('Starting job', `${timeRangeMsg} - ${lookbackMsg}`);

      // STEP 2: Get all content from Chroma since last run (posts + comments)
      emitStatus('Fetching from Chroma', 'Retrieving all content from time range (posts + comments)...');
      const allContent = await chromaService.searchByTimeRange(startDate, endDate, null, false); // null limit = get ALL, false = include comments

      if (allContent.length === 0) {
        emitStatus('No content found', 'No new content to analyze in time range');
        this.stats.successfulRuns++;
        this.lastSuccessfulRun = endDate;

        const result = {
          processed: 0,
          tasksCreated: 0,
          conversationId: null,
          duration: Date.now() - jobStartTime,
          timestamp: jobTimestamp
        };

        // Add to run history
        await this.addToHistory({
          timestamp: jobTimestamp,
          success: true,
          result
        });

        // Send no-content email to admins
        try {
          const admins = await User.find({ role: 'admin' }).lean();
          if (admins.length > 0) {
            await emailService.sendBackgroundJobNoContentReport(admins, result);
          }
        } catch (emailError) {
          console.error('Error sending admin no-content notification email:', emailError);
          // Don't fail the job if email fails
        }

        return result;
      }

      emitStatus('Content retrieved', `Found ${allContent.length} items from Chroma`);

      // STEP 3: Deduplicate against existing tasks by deeplink
      emitStatus('Deduplicating', 'Checking against existing tasks...');
      const existingTasks = await Task.find({}).select('sourceUrl').lean();
      const existingDeeplinks = new Set(existingTasks.map(t => t.sourceUrl));

      const newContent = allContent.filter(item => {
        const deeplink = item.metadata?.deeplink;
        return deeplink && !existingDeeplinks.has(deeplink);
      });

      emitStatus('Deduplication complete', `After deduplication: ${newContent.length} new items to analyze`);

      if (newContent.length === 0) {
        console.log('No new unique content after deduplication');
        this.stats.successfulRuns++;
        this.lastSuccessfulRun = endDate;

        const result = {
          processed: allContent.length,
          tasksCreated: 0,
          conversationId: null,
          duration: Date.now() - jobStartTime,
          timestamp: jobTimestamp
        };

        // Add to run history
        await this.addToHistory({
          timestamp: jobTimestamp,
          success: true,
          result
        });

        // Send no-content email to admins
        try {
          const admins = await User.find({ role: 'admin' }).lean();
          if (admins.length > 0) {
            await emailService.sendBackgroundJobNoContentReport(admins, result);
          }
        } catch (emailError) {
          console.error('Error sending admin no-content notification email:', emailError);
          // Don't fail the job if email fails
        }

        return result;
      }

      // STEP 4: Load task agent configuration
      const taskConfig = await AgentConfig.findOne({ type: 'create-tasks' });

      if (!taskConfig) {
        throw new Error('Agent configuration not found (create-tasks)');
      }

      // STEP 5: Create conversation (without expensive Ask Agent report)
      emitStatus('Creating conversation', 'Preparing sources for task generation...');

      const question = `Background job: Analyze ${newContent.length} posts from the last ${lookbackHours} hours`;
      const title = `Background Job - ${new Date().toISOString().split('T')[0]}`; // Simple date-based title

      // Skip expensive Ask Agent analysis - go straight to task generation
      const response = {
        answer: `Automated task generation from ${newContent.length} posts. Individual source analysis performed by task generation agent.`,
        usage: {
          input_tokens: 0,
          output_tokens: 0
        }
      };

      console.log('⚡ Skipping Ask Agent report generation (cost optimization)');
      console.log(`Proceeding directly to task generation for ${newContent.length} sources...`);

      const sources = newContent.map(result => ({
        id: result.id,
        platform: result.metadata?.platform,
        author: result.metadata?.author,
        content: result.content,
        deeplink: result.metadata?.deeplink,
        relevanceScore: result.relevanceScore,
        timestamp: result.metadata?.timestamp ? new Date(result.metadata.timestamp) : undefined
      }));

      const conversation = await ClaudeConversation.create({
        title,
        question,
        answer: response.answer,
        analysisDepth: 'automated',
        sourcesAnalyzed: newContent.length,
        sources,
        usage: {
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929'
        },
        backgroundGenerated: true,
        createdBy: null
      });

      emitStatus('Conversation saved', `Saved as: ${conversation._id}`);

      // STEP 6: Run Task Generation Agent on all sources (Deduplication → Haiku → Sonnet filtering)
      emitStatus('Generating tasks', `Analyzing ${newContent.length} sources with three-stage filtering...`);
      const createdTasks = await this.generateAndCreateTasks(
        conversation,
        taskConfig,
        question,
        response.answer,
        emitStatus
      );

      emitStatus('Tasks created', `Auto-created ${createdTasks.length} tasks`);

      // Update stats
      this.stats.successfulRuns++;
      this.stats.totalTasksCreated += createdTasks.length;
      this.stats.totalItemsProcessed += allContent.length;
      this.lastSuccessfulRun = endDate;

      const result = {
        processed: allContent.length,
        analyzed: newContent.length,
        tasksCreated: createdTasks.length,
        conversationId: conversation._id,
        duration: Date.now() - jobStartTime,
        timestamp: jobTimestamp
      };

      // Add to run history
      await this.addToHistory({
        timestamp: jobTimestamp,
        success: true,
        result
      });

      console.log('Intelligence Job Completed Successfully');
      console.log(`- Items processed: ${result.processed}`);
      console.log(`- Items analyzed: ${result.analyzed}`);
      console.log(`- Tasks created: ${result.tasksCreated}`);
      console.log(`- Conversation ID: ${result.conversationId}`);

      // Send success email to admins
      try {
        const admins = await User.find({ role: 'admin' }).lean();
        if (admins.length > 0) {
          await emailService.sendBackgroundJobSuccessReport(admins, result, createdTasks);
        }
      } catch (emailError) {
        console.error('Error sending admin notification email:', emailError);
        // Don't fail the job if email fails
      }

      return result;

    } catch (error) {
      this.stats.failedRuns++;

      const errorInfo = {
        timestamp: jobTimestamp,
        error: error.message
      };

      // Add failed run to history
      await this.addToHistory({
        timestamp: jobTimestamp,
        success: false,
        error: errorInfo.error
      });

      console.error('Intelligence Job Failed');
      console.error('Error:', error.message);
      console.error(error.stack);

      // Send failure email to admins
      try {
        const admins = await User.find({ role: 'admin' }).lean();
        if (admins.length > 0) {
          await emailService.sendBackgroundJobFailureReport(admins, errorInfo);
        }
      } catch (emailError) {
        console.error('Error sending admin failure notification email:', emailError);
        // Don't fail further if email fails
      }

      throw error;
    } finally {
      this.isRunning = false;
      console.log('='.repeat(60));
    }
  }

  async generateAndCreateTasks(conversation, taskConfig, question, answer, emitStatus = null) {
    const createdTasks = [];
    const analysisReport = [];

    // Deduplicate sources by deeplink
    const seenDeeplinks = new Set();
    const uniqueSources = conversation.sources.filter(source => {
      if (!source.deeplink) return true;
      if (seenDeeplinks.has(source.deeplink)) return false;
      seenDeeplinks.add(source.deeplink);
      return true;
    });

    console.log(`Analyzing ${uniqueSources.length} unique sources with three-stage filtering...`);
    if (emitStatus) emitStatus('Analyzing sources', `Processing ${uniqueSources.length} unique sources with Dedup → Haiku → Sonnet filtering...`);

    // Three-stage filtering: Deduplication → Haiku → Sonnet
    let processedCount = 0;
    let skippedCount = 0;
    let alreadyAnalyzed = 0; // NEW: Track posts skipped due to recent analysis
    let filteredByHaiku = 0;
    let analyzedBySonnet = 0;

    // Track cache metrics
    let totalCacheWrites = 0;
    let totalCacheReads = 0;

    // Get reanalyze window from environment (default 30 days)
    const REANALYZE_WINDOW_DAYS = parseInt(process.env.REANALYZE_WINDOW_DAYS) || 30;

    for (const source of uniqueSources) {
      try {
        processedCount++;

        // STAGE 0: Deduplication check (skip if analyzed within REANALYZE_WINDOW_DAYS)
        if (source.deeplink) {
          const recentAnalysis = await AnalyzedPost.wasRecentlyAnalyzed(source.deeplink, REANALYZE_WINDOW_DAYS);

          if (recentAnalysis) {
            alreadyAnalyzed++;
            const analyzedDate = recentAnalysis.lastAnalyzedAt.toLocaleDateString();
            const responseTypeInfo = recentAnalysis.lastAnalyzedResponseType
              ? ` (${recentAnalysis.lastAnalyzedResponseType})`
              : '';
            console.log(`[${processedCount}/${uniqueSources.length}] ⏭️ Already analyzed on ${analyzedDate} (score: ${recentAnalysis.lastAnalyzedScore}/12${responseTypeInfo}) - Skipping`);

            // Add to report as already analyzed
            analysisReport.push({
              sourceId: source.id,
              platform: source.platform,
              author: source.author,
              contentSnippet: source.content ? source.content.substring(0, 200) : '',
              sourceDeeplink: source.deeplink,
              score: recentAnalysis.lastAnalyzedScore,
              shouldEngage: recentAnalysis.shouldEngage,
              responseType: recentAnalysis.lastAnalyzedResponseType,
              reasoning: `Already analyzed on ${analyzedDate} (${REANALYZE_WINDOW_DAYS}-day dedup window)`,
              filteredStage: 'deduplication',
              isComment: source.metadata?.is_comment || false,
              relevanceScore: source.relevanceScore,
              analyzedAt: recentAnalysis.lastAnalyzedAt
            });

            continue; // Skip Haiku AND Sonnet
          }
        }

        // STAGE 1: Quick Haiku filter
        const filterResult = await claudeService.quickFilterWithHaiku(source);

        if (!filterResult.shouldAnalyze) {
          filteredByHaiku++;
          console.log(`[${processedCount}/${uniqueSources.length}] 🔍 Haiku filtered: ${source.platform} - ${source.author} - ${filterResult.reason}`);

          // Add to report as filtered
          analysisReport.push({
            sourceId: source.id,
            platform: source.platform,
            author: source.author,
            contentSnippet: source.content ? source.content.substring(0, 200) : '',
            sourceDeeplink: source.deeplink,
            score: 0,
            shouldEngage: false,
            reasoning: `Filtered by Haiku: ${filterResult.reason}`,
            filteredStage: 'haiku',
            isComment: source.metadata?.is_comment || false,
            relevanceScore: source.relevanceScore,
            analyzedAt: new Date()
          });

          continue; // Skip Sonnet analysis
        }

        // STAGE 2: Full Sonnet analysis (for posts that passed Haiku)
        analyzedBySonnet++;
        console.log(`[${processedCount}/${uniqueSources.length}] 🤖 Sonnet analyzing: ${source.platform} - ${source.author}`);

        // Build post content for analysis (cached method separates static from variable content)
        const postContent = this.buildPostContentForCache(question, answer, source);

        // Use cached method: instructions + valueProps cached, only postContent varies
        const response = await claudeService.analyzeForTaskWithCache(
          taskConfig.instructions,
          taskConfig.valuePropositions,
          postContent
        );
        const taskAnalysis = this.parseTaskAnalysisResponse(response.text);

        // Track cache metrics
        totalCacheWrites += response.usage?.cache_creation_input_tokens || 0;
        totalCacheReads += response.usage?.cache_read_input_tokens || 0;

        // Log score result with response type
        if (taskAnalysis) {
          const responseTypeLabel = taskAnalysis.responseType
            ? ` (${taskAnalysis.responseType})`
            : '';
          if (taskAnalysis.shouldEngage) {
            console.log(`[${processedCount}/${uniqueSources.length}] ✅ Score: ${taskAnalysis.score}/12${responseTypeLabel} - Task created`);
          } else {
            console.log(`[${processedCount}/${uniqueSources.length}] ❌ Score: ${taskAnalysis.score}/12 - Skipped (below threshold)`);
          }
        }

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

          // Auto-create task if should engage (this is the key difference)
          if (taskAnalysis.shouldEngage) {
            const task = await this.createTaskFromAnalysis(
              taskAnalysis,
              source,
              conversation._id
            );

            if (task) {
              createdTasks.push(task);
              console.log(`Auto-created task: ${task.title} (score: ${taskAnalysis.score})`);
              if (emitStatus) emitStatus('Task created', `${task.title} (score: ${taskAnalysis.score})`);
            }
          }

          // Mark post as analyzed (for future deduplication)
          if (source.deeplink) {
            await AnalyzedPost.markAsAnalyzed({
              deeplink: source.deeplink,
              platform: source.platform,
              author: source.author,
              score: taskAnalysis.score,
              responseType: taskAnalysis.responseType,
              shouldEngage: taskAnalysis.shouldEngage,
              conversationId: conversation._id
            });
          }
        }

      } catch (error) {
        skippedCount++;
        console.error(`⚠ Skipping source ${source.id} (${source.platform}):`, error.message);
        // Continue with next source instead of failing the entire job
      }
    }

    // Print filter efficiency summary
    const dedupEfficiency = uniqueSources.length > 0
      ? ((alreadyAnalyzed / uniqueSources.length) * 100).toFixed(1)
      : 0;

    const remainingAfterDedup = uniqueSources.length - alreadyAnalyzed;
    const filterEfficiency = remainingAfterDedup > 0
      ? ((filteredByHaiku / remainingAfterDedup) * 100).toFixed(1)
      : 0;

    // Calculate cache savings
    const cacheWriteCount = totalCacheWrites > 0 ? 1 : 0; // Usually just 1 write at start
    const cacheReadCount = Math.floor(totalCacheReads / 7862); // Estimate # of cache hits (7862 tokens per cache)
    const cacheCostSavings = (totalCacheReads * 15 / 1000000) - (totalCacheReads * 1.5 / 1000000); // 90% savings
    const cacheSavingsPercent = totalCacheReads > 0 ? 90 : 0;

    // Calculate total cost savings
    const totalCostReduction = dedupEfficiency;
    const haikuCostReduction = filterEfficiency;

    console.log('');
    console.log('=== Three-Stage Filter Results ===');
    console.log(`Total sources: ${uniqueSources.length}`);
    console.log(`Already analyzed (Stage 0 - ${REANALYZE_WINDOW_DAYS}-day dedup): ${alreadyAnalyzed} (${dedupEfficiency}%)`);
    console.log(`Filtered by Haiku (Stage 1): ${filteredByHaiku} (${filterEfficiency}% of remaining ${remainingAfterDedup})`);
    console.log(`Analyzed by Sonnet (Stage 2): ${analyzedBySonnet}`);
    console.log(`Cache Stats: ${cacheWriteCount} write, ${cacheReadCount} reads | Saved: $${cacheCostSavings.toFixed(2)} (${cacheSavingsPercent}% reduction on cached tokens)`);
    console.log(`Tasks generated: ${createdTasks.length}`);
    console.log(`Estimated cost savings:`);
    console.log(`  - Deduplication: ${dedupEfficiency}% (skipped both Haiku + Sonnet)`);
    console.log(`  - Haiku filter: ${filterEfficiency}% (skipped Sonnet on remaining)`);
    console.log(`  - Prompt caching: ${cacheSavingsPercent}% (on Sonnet input tokens)`);
    console.log(`  - Total reduction: ~${totalCostReduction}% fewer API calls`);
    console.log('===================================');
    console.log('');

    if (emitStatus) {
      emitStatus('Task generation complete', `Filtered ${filteredByHaiku} (${filterEfficiency}%), analyzed ${analyzedBySonnet}, created ${createdTasks.length} tasks`);
    }

    // Save analysis report to conversation
    conversation.taskGenerationReport = analysisReport;
    conversation.tasksGeneratedAt = new Date();
    await conversation.save();

    return createdTasks;
  }

  async createTaskFromAnalysis(taskAnalysis, source, conversationId) {
    try {
      // Map platform names to Task model enum
      const platformMap = {
        'lovable': 'Discord',
        'v0': 'Discord',
        'discord': 'Discord',
        'reddit': 'Reddit',
        'x': 'X',
        'twitter': 'X',
        'linkedin': 'LinkedIn'
      };

      const mappedPlatform = platformMap[source.platform?.toLowerCase()] || 'Discord';

      // Generate AI title
      let taskTitle;
      try {
        const contentForTitle = source.content || taskAnalysis.reasoning || '';
        const titlePrompt = `${source.author} on ${source.platform}: ${contentForTitle.substring(0, 200)}`;
        taskTitle = await claudeService.generateTitle(titlePrompt);
      } catch (error) {
        console.error('Error generating task title:', error);
        taskTitle = `${source.platform} - ${source.author}`;
      }

      // Create the task
      const task = await Task.create({
        title: taskTitle,
        snippet: source.content?.substring(0, 300) || taskAnalysis.reasoning,
        sourceUrl: source.deeplink || '#',
        platform: mappedPlatform,
        intent: 'engagement',
        priority: taskAnalysis.score >= 10 ? 'high' : taskAnalysis.score >= 7 ? 'medium' : 'low',
        suggestedResponse: taskAnalysis.suggestedResponse,
        reasoning: taskAnalysis.reasoning,
        metadata: {
          author: source.author,
          conversationId: conversationId,
          originalPlatform: source.platform,
          autoGenerated: true,
          score: taskAnalysis.score,
          responseType: taskAnalysis.responseType || null
        },
        foundByAgent: true
      });

      // Emit socket event
      if (global.io) {
        global.io.emit('task:created', {
          taskId: task._id.toString()
        });
      }

      return task;

    } catch (error) {
      console.error('Error creating task:', error);
      return null;
    }
  }

  buildTaskGenerationPrompt(instructions, valuePropositions, question, answer, source) {
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

  buildPostContentForCache(question, answer, source) {
    // This is the variable part that changes per post (not cached)
    // Instructions + valuePropositions are cached in the system message
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

  parseTaskAnalysisResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      console.error('Error parsing task analysis response:', error);
      return null;
    }
  }

  async runAskAgentWithAutoSplit(question, content, instructions, emitStatus, depth = 0) {
    const maxDepth = 4; // Max 16 parts (2^4)

    try {
      // Try normal analysis
      const response = await claudeService.askWithContext(question, content, instructions);
      return response;

    } catch (error) {
      // Only split if it's a token limit error and we haven't split too deep
      if (!error.message || !error.message.includes('too long')) {
        throw error; // Not a token error, re-throw
      }

      if (depth >= maxDepth) {
        console.error(`Maximum split depth (${maxDepth}) reached. Content still too large.`);
        throw new Error(`Content too large even after ${Math.pow(2, maxDepth)} splits`);
      }

      // Split content in half
      const mid = Math.floor(content.length / 2);
      const half1 = content.slice(0, mid);
      const half2 = content.slice(mid);

      const parts = Math.pow(2, depth + 1);
      console.log(`⚠ Token limit hit. Splitting content into ${parts} parts (depth ${depth + 1})...`);
      if (emitStatus) {
        emitStatus('Splitting analysis', `Content too large, analyzing in ${parts} parts...`);
      }

      // Recursively analyze each half
      const result1 = await this.runAskAgentWithAutoSplit(question, half1, instructions, emitStatus, depth + 1);
      const result2 = await this.runAskAgentWithAutoSplit(question, half2, instructions, emitStatus, depth + 1);

      // Merge the two analyses
      if (emitStatus) {
        emitStatus('Merging analyses', `Combining ${parts} analyses into one...`);
      }
      return await this.mergeAnalyses(result1, result2);
    }
  }

  async mergeAnalyses(result1, result2) {
    const mergePrompt = `You previously analyzed two separate batches of community content. Here are both analyses:

ANALYSIS 1:
${result1.answer}

ANALYSIS 2:
${result2.answer}

Please combine these into a single coherent analysis. Synthesize the insights, avoid repetition, and highlight the most important themes across both batches. Provide a comprehensive unified analysis.`;

    try {
      const merged = await claudeService.askSimple(mergePrompt);

      return {
        answer: merged.answer,
        usage: {
          input_tokens: (result1.usage?.input_tokens || 0) + (result2.usage?.input_tokens || 0) + (merged.usage?.input_tokens || 0),
          output_tokens: (result1.usage?.output_tokens || 0) + (result2.usage?.output_tokens || 0) + (merged.usage?.output_tokens || 0)
        },
        sources: [...(result1.sources || []), ...(result2.sources || [])]
      };
    } catch (error) {
      console.error('Error merging analyses:', error);
      // Fallback: concatenate the analyses
      return {
        answer: `${result1.answer}\n\n---\n\n${result2.answer}`,
        usage: {
          input_tokens: (result1.usage?.input_tokens || 0) + (result2.usage?.input_tokens || 0),
          output_tokens: (result1.usage?.output_tokens || 0) + (result2.usage?.output_tokens || 0)
        },
        sources: [...(result1.sources || []), ...(result2.sources || [])]
      };
    }
  }

  stop() {
    if (this.job) {
      this.job.stop();
      console.log('Intelligence job stopped');
    }
  }

  getStats() {
    return {
      ...this.stats,
      lastSuccessfulRun: this.lastSuccessfulRun,
      isRunning: this.isRunning,
      intervalHours: this.intervalHours,
      lookbackHours: this.lookbackHours
    };
  }

  async getHistory() {
    try {
      // Always fetch fresh from DB to ensure consistency
      const runs = await JobRunHistory.find()
        .sort({ timestamp: -1 })
        .limit(this.maxHistorySize)
        .lean();

      return runs; // Already sorted most recent first
    } catch (error) {
      console.error('Error fetching run history from database:', error);
      // Fallback to in-memory history if DB query fails
      return [...this.runHistory].reverse();
    }
  }

  async addToHistory(entry) {
    try {
      // Save to MongoDB
      await JobRunHistory.create(entry);

      // Also keep in memory for quick access
      this.runHistory.push(entry);
      if (this.runHistory.length > this.maxHistorySize) {
        this.runHistory.shift();
      }
    } catch (error) {
      console.error('Error saving run history to database:', error);
      // Still add to memory even if DB save fails
      this.runHistory.push(entry);
      if (this.runHistory.length > this.maxHistorySize) {
        this.runHistory.shift();
      }
    }
  }

  async runManually(customLookbackHours = null) {
    console.log('Manual intelligence job execution requested');
    if (customLookbackHours !== null) {
      console.log(`Using custom lookback period: ${customLookbackHours} hours`);
    }
    return await this.execute(true, customLookbackHours); // Pass true to indicate manual run, and custom lookback hours
  }
}

module.exports = new IntelligenceJob();
