const cron = require('node-cron');
const backgroundAgent = require('../services/backgroundAgent');

class IntelligenceJob {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalTasksCreated: 0,
      totalItemsProcessed: 0
    };
  }

  start() {
    // Run every hour at minute 0: '0 * * * *'
    // For testing, you can use: '*/5 * * * *' (every 5 minutes)
    this.job = cron.schedule('0 * * * *', async () => {
      await this.execute();
    });

    console.log('Intelligence job scheduled: Runs every hour at minute 0');
    return this.job;
  }

  async execute() {
    if (this.isRunning) {
      console.log('Intelligence job already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.stats.totalRuns++;

    console.log('='.repeat(60));
    console.log('Intelligence Job Execution Started');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    try {
      const result = await backgroundAgent.runIntelligenceCheck();

      this.stats.successfulRuns++;
      this.stats.totalTasksCreated += result.tasksCreated;
      this.stats.totalItemsProcessed += result.processed;
      this.lastRun = {
        timestamp: new Date(),
        success: true,
        result
      };

      console.log('Intelligence Job Completed Successfully');
      console.log(`- Items processed: ${result.processed}`);
      console.log(`- Tasks created: ${result.tasksCreated}`);
      console.log(`- Notifications sent: ${result.notificationsSent}`);
      console.log(`- Duration: ${result.duration}ms`);
    } catch (error) {
      this.stats.failedRuns++;
      this.lastRun = {
        timestamp: new Date(),
        success: false,
        error: error.message
      };

      console.error('Intelligence Job Failed');
      console.error('Error:', error.message);
      console.error(error.stack);

      // TODO: Send alert email to admins about job failure
    } finally {
      this.isRunning = false;
      console.log('='.repeat(60));
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
      lastRun: this.lastRun,
      isRunning: this.isRunning
    };
  }

  async runManually() {
    console.log('Manual intelligence job execution requested');
    return await this.execute();
  }
}

module.exports = new IntelligenceJob();
