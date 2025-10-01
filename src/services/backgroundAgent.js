const chromaService = require('./chromaService');
const claudeService = require('./claudeService');
const emailService = require('./emailService');
const { AgentConfig } = require('../models/AgentConfig');
const Task = require('../models/Task');
const User = require('../models/User');

class BackgroundAgent {
  async runIntelligenceCheck() {
    console.log('Starting background intelligence check...');
    const startTime = Date.now();

    try {
      // Load agent configuration
      const config = await AgentConfig.findOne({ type: 'background' });
      if (!config) {
        throw new Error('Background agent configuration not found');
      }

      // Get content from the last hour
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 60 * 60 * 1000); // 1 hour ago

      const recentContent = await chromaService.searchByTimeRange(startDate, endDate, 100);

      if (recentContent.length === 0) {
        console.log('No new content to analyze');
        return { processed: 0, tasksCreated: 0 };
      }

      console.log(`Found ${recentContent.length} new items to analyze`);

      // Analyze content and create tasks
      const tasks = await this.analyzeNewContent(recentContent, config.instructions);

      // Filter by notification settings
      const notifyTasks = this._filterByNotificationSettings(tasks, config.notificationSettings);

      // Send notifications if there are high-priority items
      if (notifyTasks.length > 0) {
        await this.sendNotifications(notifyTasks);
      }

      const duration = Date.now() - startTime;
      console.log(`Intelligence check completed in ${duration}ms: ${tasks.length} tasks created`);

      return {
        processed: recentContent.length,
        tasksCreated: tasks.length,
        notificationsSent: notifyTasks.length,
        duration
      };
    } catch (error) {
      console.error('Error in runIntelligenceCheck:', error);
      throw error;
    }
  }

  async analyzeNewContent(content, instructions) {
    const createdTasks = [];

    // Process in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < content.length; i += batchSize) {
      const batch = content.slice(i, i + batchSize);

      const batchPromises = batch.map(async (item) => {
        try {
          const taskData = await claudeService.generateTaskFromContent(
            item.content,
            item.metadata,
            instructions
          );

          if (taskData) {
            // Check for duplicate tasks
            const isDuplicate = await this._isDuplicateTask(taskData, item.metadata.sourceUrl);
            if (isDuplicate) {
              console.log(`Skipping duplicate task: ${taskData.title}`);
              return null;
            }

            // Create task
            const task = await Task.create({
              ...taskData,
              sourceUrl: item.metadata.sourceUrl || item.id,
              platform: item.metadata.platform,
              foundByAgent: true
            });

            console.log(`Created task: ${task.title} (${task.priority})`);
            return task;
          }

          return null;
        } catch (error) {
          console.error(`Error processing item ${item.id}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validTasks = batchResults.filter(task => task !== null);
      createdTasks.push(...validTasks);

      // Small delay between batches
      if (i + batchSize < content.length) {
        await this._sleep(500);
      }
    }

    return createdTasks;
  }

  async searchForIntents(intents) {
    const results = [];

    for (const intent of intents) {
      try {
        const intentResults = await chromaService.searchByIntent(intent, 10);
        results.push(...intentResults);
      } catch (error) {
        console.error(`Error searching for intent ${intent}:`, error);
      }
    }

    // Remove duplicates
    const uniqueResults = this._deduplicateResults(results);
    return uniqueResults;
  }

  async createTasksFromFindings(findings) {
    const tasks = [];

    for (const finding of findings) {
      try {
        const task = await Task.create({
          title: finding.title,
          snippet: finding.snippet,
          sourceUrl: finding.sourceUrl,
          platform: finding.platform,
          intent: finding.intent,
          priority: finding.priority,
          metadata: finding.metadata,
          foundByAgent: true
        });

        tasks.push(task);
        console.log(`Created task from finding: ${task.title}`);
      } catch (error) {
        console.error('Error creating task from finding:', error);
      }
    }

    return tasks;
  }

  async sendNotifications(tasks) {
    try {
      // Get all admin users and users who should be notified
      const users = await User.find({
        isVerified: true,
        $or: [
          { role: 'admin' },
          { role: 'user' } // Notify all verified users for now
        ]
      });

      if (users.length === 0) {
        console.log('No users to notify');
        return;
      }

      await emailService.sendTaskNotification(users, tasks);
      console.log(`Notifications sent to ${users.length} users`);
    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }

  async _isDuplicateTask(taskData, sourceUrl) {
    // Check if a task with the same source URL already exists
    const existingTask = await Task.findOne({ sourceUrl });
    if (existingTask) {
      return true;
    }

    // Check if a very similar task was created recently (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const similarTask = await Task.findOne({
      title: { $regex: new RegExp(taskData.title.substring(0, 30), 'i') },
      createdAt: { $gte: yesterday }
    });

    return !!similarTask;
  }

  _filterByNotificationSettings(tasks, settings) {
    if (!settings || !settings.enabled) {
      return [];
    }

    return tasks.filter(task => {
      // Check priority threshold
      const priorityLevels = { low: 1, medium: 2, high: 3 };
      const minPriorityLevel = priorityLevels[settings.minPriority] || 2;
      const taskPriorityLevel = priorityLevels[task.priority] || 1;

      if (taskPriorityLevel < minPriorityLevel) {
        return false;
      }

      // Check keywords
      if (settings.keywords && settings.keywords.length > 0) {
        const hasKeyword = settings.keywords.some(keyword =>
          task.title.toLowerCase().includes(keyword.toLowerCase()) ||
          task.snippet.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!hasKeyword) {
          return false;
        }
      }

      // Check intents
      if (settings.intents && settings.intents.length > 0) {
        if (!settings.intents.includes(task.intent)) {
          return false;
        }
      }

      return true;
    });
  }

  _deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
      if (seen.has(result.id)) {
        return false;
      }
      seen.add(result.id);
      return true;
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new BackgroundAgent();
