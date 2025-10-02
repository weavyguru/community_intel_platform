require('dotenv').config();
const chromaService = require('./src/services/chromaService');

async function testTimeOnlyQuery() {
  console.log('='.repeat(60));
  console.log('Testing Chroma Time-Only Query');
  console.log('='.repeat(60));

  try {
    // Test 1: Get all content from last 4 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 4 * 60 * 60 * 1000); // 4 hours ago

    console.log(`\nTest 1: Query last 4 hours`);
    console.log(`Start: ${startDate.toISOString()}`);
    console.log(`End: ${endDate.toISOString()}`);
    console.log(`Start Unix: ${Math.floor(startDate.getTime() / 1000)}`);
    console.log(`End Unix: ${Math.floor(endDate.getTime() / 1000)}`);

    const results = await chromaService.searchByTimeRange(startDate, endDate);

    console.log(`\nResults: ${results.length} items found`);

    if (results.length > 0) {
      console.log(`\nFirst 3 results:`);
      results.slice(0, 3).forEach((result, i) => {
        console.log(`\n[${i + 1}]`);
        console.log(`  ID: ${result.id}`);
        console.log(`  Platform: ${result.metadata?.platform || 'N/A'}`);
        console.log(`  Author: ${result.metadata?.author || 'N/A'}`);
        console.log(`  Deeplink: ${result.metadata?.deeplink || 'N/A'}`);
        console.log(`  Timestamp Unix: ${result.metadata?.timestamp_unix || 'N/A'}`);
        console.log(`  Content: ${result.content?.substring(0, 100)}...`);
      });

      // Group by platform
      const platformCounts = {};
      results.forEach(r => {
        const platform = r.metadata?.platform || 'unknown';
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      });
      console.log(`\nPlatform distribution:`, platformCounts);
    }

    // Test 2: Get all content from last 24 hours (more likely to have data)
    const startDate24h = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test 2: Query last 24 hours`);
    console.log(`Start: ${startDate24h.toISOString()}`);
    console.log(`End: ${endDate.toISOString()}`);

    const results24h = await chromaService.searchByTimeRange(startDate24h, endDate);

    console.log(`\nResults: ${results24h.length} items found`);

    if (results24h.length > 0) {
      const platformCounts24h = {};
      results24h.forEach(r => {
        const platform = r.metadata?.platform || 'unknown';
        platformCounts24h[platform] = (platformCounts24h[platform] || 0) + 1;
      });
      console.log(`Platform distribution:`, platformCounts24h);
    }

    // Test 3: Check for duplicates by deeplink
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test 3: Check for duplicates`);

    const deeplinks = results24h.map(r => r.metadata?.deeplink).filter(Boolean);
    const uniqueDeeplinks = new Set(deeplinks);

    console.log(`Total results: ${results24h.length}`);
    console.log(`Results with deeplink: ${deeplinks.length}`);
    console.log(`Unique deeplinks: ${uniqueDeeplinks.size}`);
    console.log(`Duplicates: ${deeplinks.length - uniqueDeeplinks.size}`);

    console.log(`\n${'='.repeat(60)}`);
    console.log('Test completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

testTimeOnlyQuery()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
