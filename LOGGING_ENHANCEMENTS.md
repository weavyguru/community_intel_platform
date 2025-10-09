# Logging Enhancements - Cache & Score Visibility

## Summary
Added comprehensive logging to show cache usage and scoring results in real-time during task generation.

## Changes Made

### 1. Cache Usage Logging in `claudeService.js`
After each Sonnet API call, logs cache metrics:
```
[Cache] Write: 7862 | Read: 0 | Input: 350 | Output: 150
[Cache] Write: 0 | Read: 7862 | Input: 345 | Output: 155
```

**What this shows:**
- **Write:** Tokens written to cache (first request only, ~7,862 tokens)
- **Read:** Tokens read from cache (subsequent requests, 90% cheaper)
- **Input:** Regular input tokens (not cached)
- **Output:** Response tokens

### 2. Score Logging After Sonnet Analysis
Shows the result immediately after scoring:
```
[31/36] 🤖 Sonnet analyzing: perplexity - Kunal Singh
[Cache] Write: 0 | Read: 7862 | Input: 350 | Output: 150
[31/36] ❌ Score: 4/12 - Skipped (below threshold)

[32/36] 🤖 Sonnet analyzing: replit - jefftj86
[Cache] Write: 0 | Read: 7862 | Input: 345 | Output: 155
[32/36] ✅ Score: 8/12 - Task created
```

**Indicators:**
- ✅ Green checkmark = Task created (score ≥6)
- ❌ Red X = Skipped (score <6)

### 3. Cache Summary at End of Job
Enhanced "Two-Stage Filter Results" with cache statistics:

```
=== Two-Stage Filter Results ===
Total sources: 36
Filtered by Haiku (Stage 1): 7 (19.4%)
Analyzed by Sonnet (Stage 2): 29
Cache Stats: 1 write, 29 reads | Saved: $0.40 (90% reduction on cached tokens)
Tasks generated: 5
Estimated cost savings: ~19.4% reduction in Sonnet calls + 90% on cached tokens
================================
```

**What this shows:**
- **Cache writes:** Should be 1 (first Sonnet request)
- **Cache reads:** Should equal # of Sonnet analyses - 1
- **Saved:** Dollar amount saved from caching
- **90% reduction:** Cost savings on cached tokens

## Return Value Change

### Old:
```javascript
const response = await claudeService.analyzeForTaskWithCache(...);
const taskAnalysis = this.parseTaskAnalysisResponse(response); // response was string
```

### New:
```javascript
const response = await claudeService.analyzeForTaskWithCache(...);
const taskAnalysis = this.parseTaskAnalysisResponse(response.text); // response is object
```

**Response object now includes:**
- `text`: The analysis text (JSON string)
- `usage`: Full usage metrics including cache stats

## Expected Log Output (Full Example)

```
Analyzing 36 unique sources with two-stage filtering...

[1/36] 🔍 Haiku filtered: lovable - John Doe - Marketing announcement
[2/36] 🤖 Sonnet analyzing: bolt - Jane Smith
[Cache] Write: 7862 | Read: 0 | Input: 345 | Output: 145
[2/36] ✅ Score: 7/12 - Task created

[3/36] 🤖 Sonnet analyzing: replit - Bob Johnson
[Cache] Write: 0 | Read: 7862 | Input: 350 | Output: 160
[3/36] ❌ Score: 4/12 - Skipped (below threshold)

[4/36] 🤖 Sonnet analyzing: v0 - Alice Williams
[Cache] Write: 0 | Read: 7862 | Input: 342 | Output: 155
[4/36] ✅ Score: 9/12 - Task created

... (continues for all sources)

=== Two-Stage Filter Results ===
Total sources: 36
Filtered by Haiku (Stage 1): 7 (19.4%)
Analyzed by Sonnet (Stage 2): 29
Cache Stats: 1 write, 29 reads | Saved: $0.40 (90% reduction on cached tokens)
Tasks generated: 8
Estimated cost savings: ~19.4% reduction in Sonnet calls + 90% on cached tokens
================================
```

## Verification Checklist

After restarting server and running a job, verify:

1. ✅ **First Sonnet call shows cache write:**
   - `[Cache] Write: 7862` (or similar large number)
   - `Read: 0`

2. ✅ **Subsequent Sonnet calls show cache reads:**
   - `Write: 0`
   - `[Cache] Read: 7862` (or similar)

3. ✅ **Score displayed after each analysis:**
   - Either `✅ Score: X/12 - Task created`
   - Or `❌ Score: X/12 - Skipped (below threshold)`

4. ✅ **Summary shows cache stats:**
   - Cache writes: 1
   - Cache reads: (# of Sonnet analyses - 1)
   - Dollar savings calculated

## Cost Verification

**Expected savings from caching (600 Sonnet analyses):**
- Input tokens cached: 7,862 tokens
- Cached reads: 599 requests × 7,862 tokens = 4,709,438 tokens
- Normal cost: $70.64 @ $15/1M
- Cached cost: $7.06 @ $1.50/1M
- **Savings: $63.58 per run**

**If cache is NOT working (debugging):**
- All requests show `Write: 7862, Read: 0`
- This means cache expired or isn't being recognized
- Check that requests are within 5-minute window
- Verify system messages are identical across requests

## Files Modified

1. `src/services/claudeService.js` - Added cache logging, changed return format
2. `src/jobs/intelligenceJob.js` - Added score logging, cache tracking, enhanced summary
3. `src/controllers/taskGenerationController.js` - Added score logging for interactive mode
