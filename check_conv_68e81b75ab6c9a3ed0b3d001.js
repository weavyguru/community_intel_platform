/**
 * Check conversation 68e81b75ab6c9a3ed0b3d001 analysis details
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ClaudeConversation = require('./src/models/ClaudeConversation');

async function checkConversation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const conv = await ClaudeConversation.findById('68e81b75ab6c9a3ed0b3d001').lean();

    if (!conv) {
      console.log('Conversation not found');
      process.exit(1);
    }

    const report = conv.taskGenerationReport || [];

    console.log('='.repeat(80));
    console.log('CONVERSATION ANALYSIS REPORT');
    console.log('='.repeat(80));
    console.log('Conversation ID:', conv._id);
    console.log('Total analyzed:', report.length);

    const haikuFiltered = report.filter(r => r.filteredStage === 'haiku');
    const sonnetAnalyzed = report.filter(r => !r.filteredStage || r.filteredStage !== 'haiku');

    console.log('Haiku filtered:', haikuFiltered.length);
    console.log('Sonnet analyzed:', sonnetAnalyzed.length);
    console.log('');

    console.log('='.repeat(80));
    console.log('SONNET ANALYSIS RESULTS (All posts)');
    console.log('='.repeat(80));

    sonnetAnalyzed.forEach((r, i) => {
      console.log('');
      console.log(`[${i+1}] ${r.platform} - ${r.author}`);
      console.log(`Score: ${r.score}/12, Should Engage: ${r.shouldEngage}`);
      console.log(`Reasoning: ${r.reasoning || 'No reasoning'}`);
      console.log(`Content preview: ${(r.contentSnippet || '').substring(0, 200)}...`);
      console.log('-'.repeat(80));
    });

    // Score distribution
    console.log('');
    console.log('='.repeat(80));
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
    console.error('Error:', error);
    process.exit(1);
  }
}

checkConversation();
