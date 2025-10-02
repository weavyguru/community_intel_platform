const cron = require('node-cron');
const chromaService = require('../services/chromaService');
const claudeService = require('../services/claudeService');
const { AgentConfig } = require('../models/AgentConfig');
const ClaudeConversation = require('../models/ClaudeConversation');
const Task = require('../models/Task');
const JobRunHistory = require('../models/JobRunHistory');
const User = require('../models/User');
const emailService = require('../services/emailService');

class IntelligenceJob {
  constructor() {
    this.isRunning = false;
    this.lastSuccessfulRun = null;
    this.intervalHours = 4; // Default: 4 hours
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

  async execute(isManual = false) {
    if (this.isRunning) {
      console.log('Intelligence job already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.stats.totalRuns++;

    console.log('='.repeat(60));
    console.log('Intelligence Job Execution Started');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Mode: ${isManual ? 'Manual' : 'Scheduled'}`);
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
      // Manual runs: Always use interval lookback (for testing)
      // Scheduled runs: Use last successful run if available, otherwise interval lookback
      const endDate = new Date();
      const lookbackMs = this.intervalHours * 60 * 60 * 1000;
      const startDate = (isManual || !this.lastSuccessfulRun)
        ? new Date(endDate.getTime() - lookbackMs)
        : new Date(this.lastSuccessfulRun.getTime());

      const timeRangeMsg = `Time range: ${startDate.toISOString()} to ${endDate.toISOString()}`;
      const lookbackMsg = isManual
        ? `Lookback: ${this.intervalHours} hours (manual run)`
        : `Lookback: ${this.intervalHours} hours (since ${this.lastSuccessfulRun ? 'last run' : 'configured interval'})`;
      console.log(timeRangeMsg);
      console.log(lookbackMsg);
      emitStatus('Starting job', `${timeRangeMsg} - ${lookbackMsg}`);

      // STEP 2: Get all content from Chroma since last run (no limit - get everything)
      emitStatus('Fetching from Chroma', 'Retrieving all content from time range...');
      const allContent = await chromaService.searchByTimeRange(startDate, endDate); // null limit = get ALL

      if (allContent.length === 0) {
        emitStatus('No content found', 'No new content to analyze in time range');
        this.stats.successfulRuns++;
        this.lastSuccessfulRun = endDate;
        return { processed: 0, tasksCreated: 0, conversationId: null };
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
        return { processed: allContent.length, tasksCreated: 0, conversationId: null };
      }

      // STEP 4: Load agent configurations
      const askConfig = await AgentConfig.findOne({ type: 'ask' });
      const taskConfig = await AgentConfig.findOne({ type: 'create-tasks' });

      if (!askConfig || !taskConfig) {
        throw new Error('Agent configurations not found (ask or create-tasks)');
      }

      // STEP 5: Run Ask Agent analysis (skip query strategy, use all content)
      emitStatus('Running Ask Agent', 'Analyzing content with Claude AI...');
      const question = `Analyze the community content from the last ${this.lastSuccessfulRun ? 'time period' : '4 hours'}. What are the key themes, issues, and opportunities?`;
      const instructions = askConfig.instructions || 'You are a helpful AI assistant analyzing community feedback.';

      const analysisStartTime = Date.now();
      const response = await claudeService.askWithContext(question, newContent, instructions);
      const analysisTime = Date.now() - analysisStartTime;

      emitStatus('Ask Agent complete', `Analysis completed in ${(analysisTime / 1000).toFixed(1)}s`);

      // STEP 6: Generate title and save conversation
      emitStatus('Saving conversation', 'Generating title and saving to database...');
      const title = await claudeService.generateTitle(question);

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
          model: process.env.CLAUDE_MODEL || 'claude-opus-4-20250514'
        },
        backgroundGenerated: true,
        createdBy: null
      });

      emitStatus('Conversation saved', `Saved as: ${conversation._id}`);

      // STEP 7: Run Task Generation Agent on all sources
      emitStatus('Generating tasks', `Analyzing ${newContent.length} sources with Tasks Agent...`);
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
        duration: Date.now() - analysisStartTime
      };

      // Add to run history
      await this.addToHistory({
        timestamp: new Date(),
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
        timestamp: new Date(),
        error: error.message
      };

      // Add failed run to history
      await this.addToHistory({
        timestamp: errorInfo.timestamp,
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

    console.log(`Analyzing ${uniqueSources.length} unique sources...`);
    if (emitStatus) emitStatus('Analyzing sources', `Processing ${uniqueSources.length} unique sources...`);

    // Analyze each source (same logic as taskGenerationController)
    for (const source of uniqueSources) {
      try {
        const prompt = this.buildTaskGenerationPrompt(
          taskConfig.instructions,
          taskConfig.valuePropositions,
          question,
          answer,
          source
        );

        const response = await claudeService.analyzeForTask(prompt);
        const taskAnalysis = this.parseTaskAnalysisResponse(response);

        if (taskAnalysis) {
          analysisReport.push({
            sourceId: source.id,
            platform: source.platform,
            author: source.author,
            contentSnippet: source.content ? source.content.substring(0, 200) : '',
            sourceDeeplink: source.deeplink,
            score: taskAnalysis.score,
            shouldEngage: taskAnalysis.shouldEngage,
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
        }

      } catch (error) {
        console.error(`Error analyzing source ${source.id}:`, error.message);
        // Continue with next source
      }
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
          score: taskAnalysis.score
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
      intervalHours: this.intervalHours
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

  async runManually() {
    console.log('Manual intelligence job execution requested');
    return await this.execute(true); // Pass true to indicate manual run
  }
}

module.exports = new IntelligenceJob();
