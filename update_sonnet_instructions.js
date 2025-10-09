/**
 * Script to update Sonnet task generation instructions in MongoDB
 * Fixes the overly conservative "Default to Skip" rule
 * Run with: node update_sonnet_instructions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { AgentConfig } = require('./src/models/AgentConfig');

async function updateInstructions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const taskConfig = await AgentConfig.findOne({ type: 'create-tasks' });

    if (!taskConfig) {
      console.log('❌ No create-tasks agent config found');
      process.exit(1);
    }

    console.log('Current version:', taskConfig.currentVersion);
    console.log('Updating Sonnet instructions to be less conservative...\n');

    // Fix 1: Change "Default to Skip" to "Default to PROCEED"
    let updatedInstructions = taskConfig.instructions.replace(
      'If UNCLEAR → Default to Skip (be conservative)',
      'If UNCLEAR → Default to PROCEED and score it (let the scoring matrix decide)'
    );

    // Fix 2: Relax the Component Relevance Check
    updatedInstructions = updatedInstructions.replace(
      `If YES to any → Proceed to scoring
If NO but it's a general platform complaint → Skip
If UNCLEAR → Default to Skip (be conservative)`,
      `If YES to any → Proceed to scoring
If NO but it's a general platform complaint → Skip
If UNCLEAR → Default to PROCEED and score it (be more permissive)`
    );

    // Fix 3: Add clarification to be more permissive overall
    updatedInstructions = updatedInstructions.replace(
      '#### 🔍 **"Component Relevance Check"**\n\nIf post passed the "What Are They Building?" test, now ask:',
      `#### 🔍 **"Component Relevance Check"**

If post passed the "What Are They Building?" test, now ask:

**NOTE: Be permissive here. Many apps that seem unrelated to collaboration actually need it. When in doubt, proceed to scoring and let the scoring matrix filter it out.**`
    );

    // Fix 4: Make STEP 0 less strict about app context
    updatedInstructions = updatedInstructions.replace(
      '**❌ SKIP IMMEDIATELY IF:**\n- Post is ONLY about platform-specific technical problems:',
      '**❌ SKIP IMMEDIATELY IF:**\n- Post is ONLY about platform-specific technical problems WITHOUT any mention of what they\'re building:'
    );

    // Increment version
    taskConfig.instructions = updatedInstructions;
    taskConfig.currentVersion += 1;
    taskConfig.lastUpdated = new Date();

    await taskConfig.save();

    console.log('✅ Instructions updated successfully!');
    console.log('New version:', taskConfig.currentVersion);
    console.log('\nKey changes made:');
    console.log('1. Changed "Default to Skip" → "Default to PROCEED and score it"');
    console.log('2. Made Component Relevance Check more permissive');
    console.log('3. Added note to be permissive when unclear');
    console.log('4. Clarified SKIP criteria to require NO app context');
    console.log('\nExpected outcome:');
    console.log('- More posts will reach the scoring phase');
    console.log('- Scoring matrix (6+ points) will be the primary filter');
    console.log('- Should see 60-70% of Haiku-passed posts create tasks');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateInstructions();
