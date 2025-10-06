const claudeService = require('./src/services/claudeService');

// Sample posts to test variety
const samplePosts = [
  {
    platform: 'Discord',
    author: 'user1',
    content: 'Ugh, that v0 fix cycle where the AI breaks your styles trying to fix deployment errors is brutal.',
    deeplink: 'https://discord.com/example1'
  },
  {
    platform: 'Reddit',
    author: 'user2',
    content: 'Has anyone successfully added real-time chat to a Lovable app? Keep running into deployment issues.',
    deeplink: 'https://reddit.com/example2'
  },
  {
    platform: 'Discord',
    author: 'user3',
    content: 'Very annoying when the platform randomly breaks working features during updates.',
    deeplink: 'https://discord.com/example3'
  }
];

const testInstructions = `You are testing response variety. Analyze this post and generate a suggested response.

## POST TO ANALYZE:
**Platform:** {{platform}}
**Author:** {{author}}
**Content:** {{content}}
**Link:** {{deeplink}}

Return your analysis in JSON format:
{
  "shouldEngage": true/false,
  "score": <number out of 12>,
  "reasoning": "<1-2 sentences>",
  "suggestedResponse": "<response text or empty string>"
}`;

async function testVariety() {
  console.log('🧪 Testing Response Variety\n');
  console.log('Testing 3 similar posts to verify responses vary in style...\n');
  console.log('='.repeat(80));

  for (let i = 0; i < samplePosts.length; i++) {
    const post = samplePosts[i];
    console.log(`\n📝 Test ${i + 1}/${samplePosts.length}`);
    console.log(`Platform: ${post.platform}`);
    console.log(`Content: "${post.content}"\n`);

    try {
      const prompt = testInstructions
        .replace('{{platform}}', post.platform)
        .replace('{{author}}', post.author)
        .replace('{{content}}', post.content)
        .replace('{{deeplink}}', post.deeplink);

      const response = await claudeService.analyzeForTask(prompt);

      // Parse response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        if (result.shouldEngage && result.suggestedResponse) {
          console.log('✅ Generated Response:');
          console.log('─'.repeat(80));
          console.log(result.suggestedResponse);
          console.log('─'.repeat(80));
          console.log(`Score: ${result.score}/12`);
          console.log(`Reasoning: ${result.reasoning}`);

          // Check opening
          const firstWord = result.suggestedResponse.trim().split(/[\s,]/)[0].toLowerCase();
          console.log(`Opening word: "${firstWord}"`);
        } else {
          console.log('❌ No engagement suggested');
        }
      }
    } catch (error) {
      console.error(`Error testing post ${i + 1}:`, error.message);
    }

    console.log('\n' + '='.repeat(80));
  }

  console.log('\n✨ Test Complete!\n');
  console.log('Check if responses vary in style and opening approach.');
  console.log('They should NOT all start with "Ugh" or the same pattern.');
}

testVariety().then(() => {
  console.log('\n👍 Done');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
