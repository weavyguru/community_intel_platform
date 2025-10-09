/**
 * Test script to verify is_comment:false filtering in ChromaDB
 * Run with: node test_chroma_filter.js
 */

// Load environment variables
require('dotenv').config();

const chromaService = require('./src/services/chromaService');

async function testCommentFiltering() {
  console.log('='.repeat(60));
  console.log('Testing ChromaDB is_comment:false filtering');
  console.log('='.repeat(60));

  try {
    await chromaService.initialize();
    console.log('✅ ChromaDB initialized\n');

    // Test 1: Get recent content WITHOUT comment filter
    const lookbackHours = 120; // Match user's background job test
    console.log(`TEST 1: Fetching last ${lookbackHours} hours WITHOUT comment filter`);
    console.log('-'.repeat(60));
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (lookbackHours * 60 * 60 * 1000));

    // Use searchByTimeRange to handle pagination automatically
    const allResults = await chromaService.searchByTimeRange(startDate, endDate, null, false);

    console.log(`Total items fetched: ${allResults.length}`);

    // Count comments vs posts
    let commentCount = 0;
    let postCount = 0;
    let unknownCount = 0;

    for (let i = 0; i < allResults.length; i++) {
      const item = allResults[i];
      if (item.metadata?.is_comment === true) {
        commentCount++;
      } else if (item.metadata?.is_comment === false) {
        postCount++;
      } else {
        unknownCount++;
      }
    }

    console.log(`  Posts: ${postCount}`);
    console.log(`  Comments: ${commentCount}`);
    console.log(`  Unknown: ${unknownCount}`);

    // Show sample metadata
    if (allResults.length > 0) {
      console.log('\nSample metadata (first item):');
      console.log(JSON.stringify(allResults[0].metadata, null, 2));
    }

    // Test 2: Get recent content WITH is_comment:false filter
    console.log('\n' + '='.repeat(60));
    console.log(`TEST 2: Fetching last ${lookbackHours} hours WITH is_comment:false filter`);
    console.log('-'.repeat(60));

    const postsOnlyResults = await chromaService.searchByTimeRange(startDate, endDate, null, true); // postsOnly = true

    console.log(`Total items fetched: ${postsOnlyResults.length}`);

    // Verify all are posts
    let allArePosts = true;
    for (let i = 0; i < postsOnlyResults.length; i++) {
      const item = postsOnlyResults[i];
      if (item.metadata?.is_comment !== false) {
        allArePosts = false;
        console.log(`⚠️  Found non-post at index ${i}: is_comment = ${item.metadata?.is_comment}`);
      }
    }

    if (allArePosts) {
      console.log('✅ All results are posts (is_comment:false)');
    }

    // Show sample metadata
    if (postsOnlyResults.length > 0) {
      console.log('\nSample metadata (first item):');
      console.log(JSON.stringify(postsOnlyResults[0].metadata, null, 2));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Without filter: ${allResults.length} total (${postCount} posts, ${commentCount} comments)`);
    console.log(`With filter: ${postsOnlyResults.length} posts only`);
    const filterPercentage = allResults.length > 0 ? ((commentCount / allResults.length) * 100).toFixed(1) : 0;
    console.log(`Filter effectiveness: ${commentCount} comments removed (${filterPercentage}%)`);

    if (postsOnlyResults.length === postCount) {
      console.log('\n✅ Filter working correctly: Post counts match!');
    } else {
      console.log('\n⚠️  Filter may not be working: Post counts do not match');
      console.log(`   Expected: ${postCount} posts, Got: ${postsOnlyResults.length} posts`);
    }

    console.log('\n✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

// Run the test
testCommentFiltering()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
