/**
 * Script to check the actual AgentConfig stored in MongoDB
 * Run with: node check_agent_config.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { AgentConfig } = require('./src/models/AgentConfig');

async function checkAgentConfig() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get the create-tasks agent config
    const taskConfig = await AgentConfig.findOne({ type: 'create-tasks' });

    if (!taskConfig) {
      console.log('❌ No create-tasks agent config found');
      process.exit(1);
    }

    console.log('='.repeat(80));
    console.log('CREATE-TASKS AGENT CONFIG');
    console.log('='.repeat(80));
    console.log(`Type: ${taskConfig.type}`);
    console.log(`Version: ${taskConfig.currentVersion}`);
    console.log(`Last Updated: ${taskConfig.lastUpdated}`);
    console.log('\n' + '='.repeat(80));
    console.log('INSTRUCTIONS');
    console.log('='.repeat(80));
    console.log(taskConfig.instructions);
    console.log('\n' + '='.repeat(80));
    console.log('VALUE PROPOSITIONS');
    console.log('='.repeat(80));
    console.log(taskConfig.valuePropositions || 'None set');
    console.log('='.repeat(80));

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAgentConfig();
