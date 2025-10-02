require('dotenv').config();
const chromaService = require('./src/services/chromaService');

const QUESTION = "What's the most common problem across all platforms?";
const LIMIT = 25;

// Helper function to filter out low-quality content (same as in searchController)
function filterLowQualityContent(results) {
  const LOW_QUALITY_PATTERNS = /^(why\?*|help|same|lol|\+1|same here|its annoying|it'?s annoying|very annoying|patience grasshopper|i could help|u can tell me)$/i;
  const MIN_POST_LENGTH = 50;
  const MIN_COMMENT_LENGTH = 100;

  return results.filter(result => {
    const content = result.content || '';
    const isComment = result.metadata?.is_comment === true;
    const trimmedContent = content.trim();

    // Check for low-quality patterns
    if (LOW_QUALITY_PATTERNS.test(trimmedContent)) {
      return false;
    }

    // Check minimum length based on type
    const minLength = isComment ? MIN_COMMENT_LENGTH : MIN_POST_LENGTH;
    if (trimmedContent.length < minLength) {
      return false;
    }

    return true;
  });
}

async function testSearchQuality() {
  console.log('='.repeat(80));
  console.log('SEARCH QUALITY COMPARISON TEST');
  console.log('='.repeat(80));
  console.log(`Question: "${QUESTION}"`);
  console.log(`Target results: ${LIMIT}`);
  console.log('='.repeat(80));
  console.log('');

  // TEST 1: OLD APPROACH (no filtering, mixed posts/comments)
  console.log('TEST 1: OLD APPROACH (No Quality Filtering)');
  console.log('-'.repeat(80));

  const oldResults = await chromaService.searchSemantic(QUESTION, LIMIT * 2, {});
  const oldResultsLimited = oldResults.slice(0, LIMIT);

  const oldStats = {
    total: oldResultsLimited.length,
    posts: oldResultsLimited.filter(r => r.metadata?.is_comment === false).length,
    comments: oldResultsLimited.filter(r => r.metadata?.is_comment === true).length,
    unknown: oldResultsLimited.filter(r => r.metadata?.is_comment === undefined).length,
    avgLength: Math.round(oldResultsLimited.reduce((sum, r) => sum + r.content.length, 0) / oldResultsLimited.length),
    shortContent: oldResultsLimited.filter(r => r.content.trim().length < 50).length,
    platforms: {}
  };

  oldResultsLimited.forEach(r => {
    const platform = r.metadata?.platform || 'unknown';
    oldStats.platforms[platform] = (oldStats.platforms[platform] || 0) + 1;
  });

  console.log(`Total: ${oldStats.total}`);
  console.log(`Posts: ${oldStats.posts} (${Math.round(oldStats.posts/oldStats.total*100)}%)`);
  console.log(`Comments: ${oldStats.comments} (${Math.round(oldStats.comments/oldStats.total*100)}%)`);
  console.log(`Unknown: ${oldStats.unknown}`);
  console.log(`Avg content length: ${oldStats.avgLength} chars`);
  console.log(`Short content (<50 chars): ${oldStats.shortContent}`);
  console.log(`Platforms: ${Object.keys(oldStats.platforms).length}`);
  console.log('');

  console.log('SAMPLE RESULTS (first 5):');
  oldResultsLimited.slice(0, 5).forEach((r, idx) => {
    const type = r.metadata?.is_comment === true ? 'COMMENT' : r.metadata?.is_comment === false ? 'POST' : 'UNKNOWN';
    console.log(`\n${idx + 1}. [${type}] ${r.metadata?.platform} - ${r.metadata?.author || 'unknown'}`);
    console.log(`   Length: ${r.content.length} chars`);
    console.log(`   Content: "${r.content.substring(0, 100)}${r.content.length > 100 ? '...' : ''}"`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: NEW APPROACH (Quality Filtering + Post Prioritization)');
  console.log('-'.repeat(80));

  // Get posts first
  const postsRaw = await chromaService.searchSemantic(QUESTION, LIMIT * 2, { isComment: false });
  const qualityPosts = filterLowQualityContent(postsRaw);

  // Get comments to backfill if needed
  const needed = Math.max(0, LIMIT - qualityPosts.length);
  let qualityComments = [];
  if (needed > 0) {
    const commentsRaw = await chromaService.searchSemantic(QUESTION, needed * 2, { isComment: true });
    qualityComments = filterLowQualityContent(commentsRaw);
  }

  // Combine (posts first)
  const newResults = [...qualityPosts.slice(0, LIMIT), ...qualityComments.slice(0, needed)].slice(0, LIMIT);

  const newStats = {
    total: newResults.length,
    posts: newResults.filter(r => r.metadata?.is_comment === false).length,
    comments: newResults.filter(r => r.metadata?.is_comment === true).length,
    unknown: newResults.filter(r => r.metadata?.is_comment === undefined).length,
    avgLength: Math.round(newResults.reduce((sum, r) => sum + r.content.length, 0) / newResults.length),
    shortContent: newResults.filter(r => r.content.trim().length < 50).length,
    platforms: {}
  };

  newResults.forEach(r => {
    const platform = r.metadata?.platform || 'unknown';
    newStats.platforms[platform] = (newStats.platforms[platform] || 0) + 1;
  });

  console.log(`Total: ${newStats.total}`);
  console.log(`Posts: ${newStats.posts} (${Math.round(newStats.posts/newStats.total*100)}%)`);
  console.log(`Comments: ${newStats.comments} (${Math.round(newStats.comments/newStats.total*100)}%)`);
  console.log(`Unknown: ${newStats.unknown}`);
  console.log(`Avg content length: ${newStats.avgLength} chars`);
  console.log(`Short content (<50 chars): ${newStats.shortContent}`);
  console.log(`Platforms: ${Object.keys(newStats.platforms).length}`);
  console.log('');

  console.log('SAMPLE RESULTS (first 5):');
  newResults.slice(0, 5).forEach((r, idx) => {
    const type = r.metadata?.is_comment === true ? 'COMMENT' : r.metadata?.is_comment === false ? 'POST' : 'UNKNOWN';
    console.log(`\n${idx + 1}. [${type}] ${r.metadata?.platform} - ${r.metadata?.author || 'unknown'}`);
    console.log(`   Length: ${r.content.length} chars`);
    console.log(`   Content: "${r.content.substring(0, 100)}${r.content.length > 100 ? '...' : ''}"`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('IMPROVEMENT SUMMARY');
  console.log('='.repeat(80));
  console.log(`Posts: ${oldStats.posts} → ${newStats.posts} (+${newStats.posts - oldStats.posts})`);
  console.log(`Comments: ${oldStats.comments} → ${newStats.comments} (${newStats.comments - oldStats.comments})`);
  console.log(`Avg length: ${oldStats.avgLength} → ${newStats.avgLength} chars (+${newStats.avgLength - oldStats.avgLength})`);
  console.log(`Short content: ${oldStats.shortContent} → ${newStats.shortContent} (-${oldStats.shortContent - newStats.shortContent})`);

  const improvement = {
    morePostsFocused: newStats.posts > oldStats.posts,
    longerContent: newStats.avgLength > oldStats.avgLength,
    lessShortContent: newStats.shortContent < oldStats.shortContent
  };

  console.log('');
  console.log('Quality Improvements:');
  console.log(`  ✓ More post-focused: ${improvement.morePostsFocused ? 'YES' : 'NO'}`);
  console.log(`  ✓ Longer avg content: ${improvement.longerContent ? 'YES' : 'NO'}`);
  console.log(`  ✓ Less short content: ${improvement.lessShortContent ? 'YES' : 'NO'}`);
  console.log('='.repeat(80));
}

testSearchQuality().then(() => {
  console.log('Test complete');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
