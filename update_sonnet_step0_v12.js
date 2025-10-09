/**
 * Script to update Sonnet STEP 0 to v12 - Ultra-permissive for ANY development activity
 * v11 → v12: Change "What are they building?" to "Are they doing ANY development work?"
 * Run with: node update_sonnet_step0_v12.js
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
    console.log('Updating Sonnet STEP 0 to v12 - Ultra-permissive for ANY development activity...\n');

    let updatedInstructions = taskConfig.instructions;

    // Fix 1: Replace the "What Are They Building?" test header and description
    updatedInstructions = updatedInstructions.replace(
      '#### 🔍 **"What Are They Building?" Test**\n\nAsk yourself: Can I identify what application or product this person is building?',
      '#### 🔍 **"Are They Doing Development Work?" Test**\n\nAsk yourself: Is this person doing ANY development, coding, or technical work with an AI platform?'
    );

    // Fix 2: Replace the PROCEED criteria to be much more permissive
    const oldProceedSection = `**✅ PROCEED TO ANALYSIS IF:**
- Post describes building an app/product (dating app, enterprise tool, SaaS, internal dashboard, social platform, team workspace)
- Post mentions developing features that naturally need collaboration (user-to-user communication, team workflows, document sharing, activity streams)
- Post explicitly mentions needing/building chat, messaging, file sharing, activity feeds, real-time collaboration, or AI copilots
- Building something where users need to interact with each other or work together`;

    const newProceedSection = `**✅ PASS (assume they're developing) IF:**
- Using AI platforms (Replit, Bolt, v0, Lovable, Cursor, Retool, Claude Artifacts) for ANY technical work:
  - Refactoring, debugging, troubleshooting, implementing, deploying code
  - Mentions "my app", "our solution", "my project", "our [platform] app/setup"
  - Questions about platform features WHILE developing/building
  - Performance, cost, or technical issues WHILE using platform actively
  - ANY coding or development activity mentioned (even without explicit "building X app" statement)
- Questions like "How do I..." + platform name (implies active development)
- Posts mentioning specific technical implementations or features they're working on`;

    updatedInstructions = updatedInstructions.replace(oldProceedSection, newProceedSection);

    // Fix 3: Update the SKIP section to be clearer about requiring ZERO dev context
    const oldSkipSection = `**❌ SKIP IMMEDIATELY IF:**`;

    const newSkipSection = `**❌ SKIP ONLY IF (no development context at all):**`;

    updatedInstructions = updatedInstructions.replace(oldSkipSection, newSkipSection);

    // Fix 4: Update example distinctions to show v12 logic
    const oldExampleRow1 = `| "My Supabase database won't connect to Bolt" | ✅ PROCEED | Bolt mention = assume building, let scoring decide (v11: more permissive) |`;
    const newExampleRow1 = `| "My Supabase database won't connect to Bolt" | ✅ PROCEED | Bolt + "my" = active development, let scoring decide (v12: ultra-permissive) |`;

    updatedInstructions = updatedInstructions.replace(oldExampleRow1, newExampleRow1);

    const oldExampleRow2 = `| "Getting 'Module not found' error in v0" | ✅ PROCEED | v0 mention = developer building, let scoring matrix decide (v11 change) |`;
    const newExampleRow2 = `| "Getting 'Module not found' error in v0" | ✅ PROCEED | v0 + technical error = active development, let scoring decide (v12 change) |`;

    updatedInstructions = updatedInstructions.replace(oldExampleRow2, newExampleRow2);

    const oldExampleRow3 = `| "Replit Agent 3 costs are too high for my use case" | ✅ PROCEED | Replit mention = active usage, assume building something (v11 change) |`;
    const newExampleRow3 = `| "Replit Agent 3 costs are too high for my use case" | ✅ PROCEED | Replit + "my use case" = active development work (v12) |`;

    updatedInstructions = updatedInstructions.replace(oldExampleRow3, newExampleRow3);

    // Fix 5: Add new example rows for v12 scenarios
    const exampleTableEnd = `| "We're launching our AI model today!" (company announcement) | ❌ SKIP | Marketing announcement, not a developer question |`;

    const newExamples = `| "We're launching our AI model today!" (company announcement) | ❌ SKIP | Marketing announcement, not a developer question |
| "I'm refactoring my login system with Replit Agent 3" | ✅ PROCEED | Refactoring = development activity (v12: passes now) |
| "Our Retool solution has performance issues with large datasets" | ✅ PROCEED | "Our solution" + troubleshooting = their app (v12: passes now) |`;

    updatedInstructions = updatedInstructions.replace(exampleTableEnd, newExamples);

    // Increment version
    taskConfig.instructions = updatedInstructions;
    taskConfig.currentVersion += 1;
    taskConfig.lastUpdated = new Date();

    await taskConfig.save();

    console.log('✅ Instructions updated successfully!');
    console.log('New version:', taskConfig.currentVersion);
    console.log('\nKey changes made:');
    console.log('1. Changed test from "What Are They Building?" → "Are They Doing Development Work?"');
    console.log('2. PASS ANY development activity on AI platforms (refactoring, debugging, troubleshooting)');
    console.log('3. PASS if mentions "my app", "our solution", "my project" (implies ownership)');
    console.log('4. PASS questions like "How do I..." + platform name (implies active dev)');
    console.log('5. SKIP only if ZERO development context (pure marketing/announcements)');
    console.log('6. Added examples: refactoring, performance troubleshooting now PASS');
    console.log('\nExpected outcomes:');
    console.log('- Post #27 (Replit refactoring): 0 → 5-7 points ✅');
    console.log('- Post #30 (Retool performance): 0 → 4-6 points ✅');
    console.log('- 10-20% of Sonnet-analyzed posts should create tasks (up from 0%)');
    console.log('- Fewer false negatives (missing legitimate developers)');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateInstructions();
