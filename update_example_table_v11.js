/**
 * Script to update the Example Distinctions table to align with v11 rules
 * Run with: node update_example_table_v11.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { AgentConfig } = require('./src/models/AgentConfig');

async function updateExamples() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const taskConfig = await AgentConfig.findOne({ type: 'create-tasks' });

    if (!taskConfig) {
      console.log('❌ No create-tasks agent config found');
      process.exit(1);
    }

    console.log('Current version:', taskConfig.currentVersion);
    console.log('Updating Example Distinctions table to align with v11 permissive rules...\n');

    let updatedInstructions = taskConfig.instructions;

    // Replace the outdated example table
    const oldExampleTable = `**Example Distinctions:**

| Post Content | Decision | Reason |
|--------------|----------|--------|
| "Building a dating app with Lovable, need to add user profiles" | ✅ PROCEED | Dating app needs chat/messaging - clear collaboration use case |
| "My Supabase database won't connect to Bolt" | ❌ SKIP | Database config issue, no mention of what they're building |
| "Creating an enterprise project management tool, struggling with deployment" | ✅ PROCEED | Enterprise PM tool needs collaboration, deployment mentioned as context |
| "Getting 'Module not found' error in v0" | ❌ SKIP | Generic error without app context |
| "Lost all my tokens debugging this API call" | ❌ SKIP | Token complaint without describing their project |
| "Building a SaaS for teams to coordinate field work" | ✅ PROCEED | Team coordination explicitly needs collaboration features |`;

    const newExampleTable = `**Example Distinctions (Updated for v11 - More Permissive):**

| Post Content | Decision | Reason |
|--------------|----------|--------|
| "Building a dating app with Lovable, need to add user profiles" | ✅ PROCEED | Dating app needs chat/messaging - clear collaboration use case |
| "My Supabase database won't connect to Bolt" | ✅ PROCEED | Bolt mention = assume building, let scoring decide (v11: more permissive) |
| "Creating an enterprise project management tool, struggling with deployment" | ✅ PROCEED | Enterprise PM tool needs collaboration, deployment mentioned as context |
| "Getting 'Module not found' error in v0" | ✅ PROCEED | v0 mention = developer building, let scoring matrix decide (v11 change) |
| "Replit Agent 3 costs are too high for my use case" | ✅ PROCEED | Replit mention = active usage, assume building something (v11 change) |
| "Building a SaaS for teams to coordinate field work" | ✅ PROCEED | Team coordination explicitly needs collaboration features |
| "How do I set up MongoDB?" with no other context | ❌ SKIP | Pure infrastructure, ZERO coding context (v11: only skip these) |
| "We're launching our AI model today!" (company announcement) | ❌ SKIP | Marketing announcement, not a developer question |`;

    updatedInstructions = updatedInstructions.replace(oldExampleTable, newExampleTable);

    // Save
    taskConfig.instructions = updatedInstructions;
    taskConfig.lastUpdated = new Date();

    await taskConfig.save();

    console.log('✅ Example table updated successfully!');
    console.log('Version remains:', taskConfig.currentVersion);
    console.log('\nKey changes to examples:');
    console.log('1. "My Supabase database won\'t connect to Bolt" → ✅ PROCEED (was SKIP)');
    console.log('2. "Getting \'Module not found\' error in v0" → ✅ PROCEED (was SKIP)');
    console.log('3. Added "Replit Agent 3 costs" example → ✅ PROCEED');
    console.log('4. Changed "Lost all tokens" → REMOVED (ambiguous)');
    console.log('5. Added pure infrastructure example → ❌ SKIP');
    console.log('6. Added company announcement example → ❌ SKIP');
    console.log('\nExamples now align with v11 permissive rules!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateExamples();
