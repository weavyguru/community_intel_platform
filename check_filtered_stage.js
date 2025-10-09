/**
 * Check filteredStage field in taskGenerationReport
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ClaudeConversation = require('./src/models/ClaudeConversation');

async function checkFilteredStage() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const latest = await ClaudeConversation.findOne()
      .sort({ createdAt: -1 })
      .lean();

    const report = latest.taskGenerationReport || [];

    console.log('Total items:', report.length);

    const haikuFiltered = report.filter(r => r.filteredStage === 'haiku');
    const sonnetOnly = report.filter(r => !r.filteredStage || r.filteredStage !== 'haiku');

    console.log('Haiku filtered (filteredStage="haiku"):', haikuFiltered.length);
    console.log('Sonnet analyzed (no filteredStage or not "haiku"):', sonnetOnly.length);
    console.log('');

    console.log('='.repeat(80));
    console.log('ALL ITEMS - FILTERED STAGE VALUES');
    console.log('='.repeat(80));
    report.forEach((r, i) => {
      const stage = r.filteredStage || 'undefined';
      const reasoningPreview = r.reasoning ? r.reasoning.substring(0, 60) : 'no reasoning';
      console.log(`[${i+1}] filteredStage: ${stage}`);
      console.log(`    Platform: ${r.platform}, Author: ${r.author}`);
      console.log(`    Reasoning: ${reasoningPreview}...`);
      console.log('');
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkFilteredStage();
