/**
 * Check latest conversation analysis report
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ClaudeConversation = require('./src/models/ClaudeConversation');

async function checkAnalysis() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const latest = await ClaudeConversation.findOne()
      .sort({ createdAt: -1 })
      .lean();

    if (!latest) {
      console.log('❌ No conversations found');
      process.exit(1);
    }

    console.log('Latest conversation ID:', latest._id);
    console.log('Created at:', latest.createdAt);
    console.log('Total items in task generation report:', latest.taskGenerationReport?.length || 0);

    const sonnetAnalyzed = latest.taskGenerationReport?.filter(r => !r.filteredStage || r.filteredStage !== 'haiku') || [];
    const haikuFiltered = latest.taskGenerationReport?.filter(r => r.filteredStage === 'haiku') || [];

    console.log('Filtered by Haiku:', haikuFiltered.length);
    console.log('Analyzed by Sonnet:', sonnetAnalyzed.length);

    console.log('\n' + '='.repeat(80));
    console.log('SONNET ANALYSIS RESULTS');
    console.log('='.repeat(80));

    sonnetAnalyzed.slice(0, 15).forEach((r, i) => {
      console.log(`\n[${i+1}] ${r.platform} - ${r.author}`);
      console.log(`Score: ${r.score}/12, Should Engage: ${r.shouldEngage}`);
      console.log(`Reasoning: ${r.reasoning || 'No reasoning provided'}`);
      console.log(`Content: ${(r.contentSnippet || '').substring(0, 200)}...`);
      console.log('-'.repeat(80));
    });

    // Score distribution
    console.log('\n' + '='.repeat(80));
    console.log('SCORE DISTRIBUTION');
    console.log('='.repeat(80));
    const scoreCounts = {};
    sonnetAnalyzed.forEach(r => {
      const score = r.score || 0;
      scoreCounts[score] = (scoreCounts[score] || 0) + 1;
    });
    Object.keys(scoreCounts).sort((a, b) => Number(b) - Number(a)).forEach(score => {
      console.log(`Score ${score}: ${scoreCounts[score]} posts`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAnalysis();
