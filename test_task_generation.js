require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const claudeService = require('./src/services/claudeService');
const { AgentConfig } = require('./src/models/AgentConfig');

const uri = process.env.MONGODB_URI;

// Helper function to build the task generation prompt
function buildTaskGenerationPrompt(instructions, valuePropositions, question, answer, source) {
  return `${instructions}

## WEAVY CONTEXT:
${valuePropositions}

## SUMMARY REPORT:
**Question:** ${question}

**Analysis:** ${answer}

## POST TO ANALYZE:
**Platform:** ${source.platform}
**Author:** ${source.author}
**Content:** ${source.content}
**Link:** ${source.deeplink}
**Relevance Score:** ${source.relevanceScore}

---

Please analyze this post using the scoring framework provided in the instructions above.

Return your analysis in the following JSON format:
{
  "shouldEngage": true/false,
  "score": <number out of 12>,
  "reasoning": "<1-2 sentences explaining your decision>",
  "suggestedResponse": "<the response text if engaging, or empty string if not>"
}`;
}

// Helper function to parse Claude's response
function parseTaskAnalysisResponse(response) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: try to parse the whole response
    return JSON.parse(response);
  } catch (error) {
    console.error('Error parsing task analysis response:', error);
    return null;
  }
}

async function testTaskGeneration() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('community_intel');

    // Load the conversation
    const conversation = await db.collection('claudeconversations').findOne({
      _id: new ObjectId('68de41eaceeeb37be74eb984')
    });

    if (!conversation) {
      console.error('Conversation not found');
      return;
    }

    // Get the updated config
    const config = await db.collection('agentconfigs').findOne({ type: 'create-tasks' });
    if (!config) {
      console.error('Config not found');
      return;
    }

    console.log('='.repeat(80));
    console.log('TESTING TASK GENERATION WITH UPDATED INSTRUCTIONS');
    console.log('='.repeat(80));
    console.log(`Agent Config Version: ${config.currentVersion}`);
    console.log(`Total sources to analyze: ${conversation.sources.length}`);
    console.log('='.repeat(80));
    console.log('');

    // Deduplicate sources
    const seenDeeplinks = new Set();
    const uniqueSources = conversation.sources.filter(source => {
      if (!source.deeplink) return true;
      if (seenDeeplinks.has(source.deeplink)) return false;
      seenDeeplinks.add(source.deeplink);
      return true;
    });

    const suggestedTasks = [];
    let processedCount = 0;

    // Analyze each source
    for (const source of uniqueSources) {
      try {
        processedCount++;
        console.log(`[${processedCount}/${uniqueSources.length}] Analyzing: ${source.platform} - ${source.author}`);
        console.log(`   Content: "${source.content.substring(0, 80)}..."`);

        // Build prompt
        const prompt = buildTaskGenerationPrompt(
          config.instructions,
          config.valuePropositions,
          conversation.question,
          conversation.answer,
          source
        );

        // Call Claude
        const response = await claudeService.analyzeForTask(prompt);

        // Parse response
        const taskAnalysis = parseTaskAnalysisResponse(response);

        if (taskAnalysis) {
          console.log(`   Score: ${taskAnalysis.score}/12 | Engage: ${taskAnalysis.shouldEngage}`);
          console.log(`   Reasoning: ${taskAnalysis.reasoning}`);

          // Add if should engage
          if (taskAnalysis.shouldEngage) {
            suggestedTasks.push({
              sourceId: source.id,
              sourceContent: source.content,
              sourceDeeplink: source.deeplink,
              platform: source.platform,
              author: source.author,
              shouldEngage: taskAnalysis.shouldEngage,
              score: taskAnalysis.score,
              reasoning: taskAnalysis.reasoning,
              suggestedResponse: taskAnalysis.suggestedResponse,
              relevanceScore: source.relevanceScore
            });
            console.log(`   ✅ TASK GENERATED`);
          } else {
            console.log(`   ⏭️  Skipped`);
          }
        } else {
          console.log(`   ❌ Failed to parse response`);
        }

        console.log('');

      } catch (error) {
        console.error(`   Error analyzing source ${source.id}:`, error.message);
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total sources analyzed: ${processedCount}`);
    console.log(`Tasks generated: ${suggestedTasks.length}`);
    console.log(`Conversion rate: ${((suggestedTasks.length / processedCount) * 100).toFixed(1)}%`);
    console.log('='.repeat(80));
    console.log('');

    if (suggestedTasks.length > 0) {
      console.log('GENERATED TASKS:');
      console.log('-'.repeat(80));
      suggestedTasks.forEach((task, idx) => {
        console.log(`\n${idx + 1}. [${task.score}/12] ${task.platform} - ${task.author}`);
        console.log(`   "${task.sourceContent.substring(0, 100)}..."`);
        console.log(`   Reasoning: ${task.reasoning}`);
      });
    }

    await client.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testTaskGeneration();
