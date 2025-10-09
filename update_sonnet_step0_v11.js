/**
 * Script to update Sonnet STEP 0 filter in MongoDB AgentConfig
 * v10 → v11: Make STEP 0 more permissive, let scoring matrix do the filtering
 * Run with: node update_sonnet_step0_v11.js
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
    console.log('Updating Sonnet STEP 0 filter to be MORE PERMISSIVE...\n');

    let updatedInstructions = taskConfig.instructions;

    // Fix 1: Replace the overly strict SKIP section with more permissive rules
    const oldSkipSection = `**❌ SKIP IMMEDIATELY IF:**
- Post is ONLY about platform-specific technical problems WITHOUT any mention of what they're building:
  - Database configuration/connection issues (Supabase setup, MongoDB connection, PostgreSQL errors)
  - Authentication/authorization setup problems (OAuth issues, JWT config, session management)
  - Deployment/infrastructure failures (build errors, hosting problems, CI/CD issues)
  - Billing/pricing complaints about platforms (unexpected charges, credit limits, subscription issues)
  - Platform migration problems (v1 to v2 issues, breaking changes, version conflicts)
  - General API call failures (REST endpoints broken, GraphQL errors)
  - Error loops without any context about what they're building
  - Code syntax errors, dependency conflicts, or framework-specific bugs`;

    const newSkipSection = `**✅ PASS (assume they're building) IF:**
- Technical questions about AI platforms (Lovable, Replit, Bolt, v0, Cursor, Retool, Claude Artifacts)
- Questions about implementing features or solving coding problems
- Deployment/build issues with AI platforms (they're trying to ship something)
- Platform-specific errors or bugs (they're actively developing)
- Cost/billing questions about AI platforms (shows active usage)

**❌ SKIP IMMEDIATELY IF:**
- Pure infrastructure problems with ZERO coding context:
  - ONLY database configuration (no mention of building anything)
  - ONLY authentication setup (no app context)
  - Generic "how do I connect to MongoDB" with no project mention
- Marketing/thought leadership posts from companies
- Research paper announcements from institutions
- Industry news articles or platform update announcements
- Hiring posts or job postings
- Networking/personal branding posts
- Product announcements from businesses (not individual developers)`;

    updatedInstructions = updatedInstructions.replace(oldSkipSection, newSkipSection);

    // Fix 2: Update the Component Relevance Check to be even more permissive
    const oldRelevanceNote = `**NOTE: Be permissive here. Many apps that seem unrelated to collaboration actually need it. When in doubt, proceed to scoring and let the scoring matrix filter it out.**`;

    const newRelevanceNote = `**NOTE: Be VERY permissive here. If they're asking about Lovable/Replit/Bolt/v0/Retool/Cursor, assume they're building an app that could benefit from collaboration. When in doubt, ALWAYS proceed to scoring. Let the 12-point scoring matrix make the final decision, not the STEP 0 filter.**`;

    updatedInstructions = updatedInstructions.replace(oldRelevanceNote, newRelevanceNote);

    // Fix 3: Update "If UNCLEAR" default in Component Relevance Check
    const oldUnclearRule = `If YES to any → Proceed to scoring
If NO but it's a general platform complaint → Skip
If UNCLEAR → Default to PROCEED and score it (let the scoring matrix decide)`;

    const newUnclearRule = `If YES to any → Proceed to scoring
If NO but it's a general platform complaint → Skip
If UNCLEAR about collaboration needs → PROCEED to scoring (default to pass)
If they're asking about AI platforms → PROCEED to scoring (assume they're building)`;

    updatedInstructions = updatedInstructions.replace(oldUnclearRule, newUnclearRule);

    // Increment version
    taskConfig.instructions = updatedInstructions;
    taskConfig.currentVersion += 1;
    taskConfig.lastUpdated = new Date();

    await taskConfig.save();

    console.log('✅ Instructions updated successfully!');
    console.log('New version:', taskConfig.currentVersion);
    console.log('\nKey changes made:');
    console.log('1. ✅ PASS technical questions about AI platforms (assume they\'re building)');
    console.log('2. ✅ PASS deployment/build/cost issues (shows active development)');
    console.log('3. ❌ SKIP only pure infrastructure with ZERO coding context');
    console.log('4. ❌ SKIP marketing/announcements/hiring (not developer posts)');
    console.log('5. Made "If UNCLEAR" default to PROCEED in all cases');
    console.log('\nExpected outcome:');
    console.log('- Posts like "Replit cost issues" or "v0 parameter problems" now reach scoring');
    console.log('- Scoring matrix (12 points) decides if we engage, not STEP 0 hard-skip');
    console.log('- Should see 10-30% of analyzed posts create tasks (instead of 0%)');
    console.log('- Examples from recent run that would NOW pass:');
    console.log('  • Post 22 (Replit Agent 3 costs): 0 → ~7 points ✅');
    console.log('  • Post 23 (v0 URL parameters): 0 → ~6 points ✅');
    console.log('  • Post 26 (Retool custom component): 0 → ~5 points ⚠️');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateInstructions();
