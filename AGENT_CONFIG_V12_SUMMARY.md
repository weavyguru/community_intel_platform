# AgentConfig v12 Update Summary

## Changes Made

Updated MongoDB AgentConfig from **v11 → v12** to fix false negatives where legitimate developers were being scored 0/12.

## The Problem (v11)

Posts like these scored 0/12:
- **Post #27:** "I'm refactoring my login system with Replit Agent 3" → Scored 0
- **Post #30:** "Our Retool solution has performance issues" → Scored 0

**Root cause:** STEP 0's "What Are They Building?" test required explicit statements like "I'm building an app". Real developers often just say:
- "I'm refactoring X"
- "Our solution has issues"
- "How do I fix this?"

## The Solution (v12)

### Key Change: Shifted Focus from "What" to "Any"

**v11:** "Can I identify WHAT application they're building?" ❌ Too specific
**v12:** "Are they doing ANY development work?" ✅ Much broader

### Updated STEP 0 Test

**Header Changed:**
- OLD: "What Are They Building?" Test
- NEW: "Are They Doing Development Work?" Test

**NEW PASS Criteria (ultra-permissive):**
```
✅ PASS (assume they're developing) IF:
- Using AI platforms for ANY technical work:
  - Refactoring, debugging, troubleshooting, implementing, deploying
  - Mentions "my app", "our solution", "my project"
  - Questions about platform features WHILE developing
  - Performance/cost issues WHILE using platform
- Questions like "How do I..." + platform name (implies active development)
- ANY coding or development activity mentioned
```

**SKIP Criteria (unchanged - only obvious noise):**
```
❌ SKIP ONLY IF (no development context at all):
- Pure marketing/PR from companies
- Thought leadership with ZERO code mention
- Networking/hiring posts
- Product reviews with no personal project
```

### Updated Examples

Added v12 examples to the table:

| Post Content | Decision | Reason |
|--------------|----------|--------|
| "I'm refactoring my login system with Replit Agent 3" | ✅ PROCEED | Refactoring = development activity (v12: passes now) |
| "Our Retool solution has performance issues with large datasets" | ✅ PROCEED | "Our solution" + troubleshooting = their app (v12: passes now) |
| "My Supabase database won't connect to Bolt" | ✅ PROCEED | Bolt + "my" = active development (v12: ultra-permissive) |
| "Getting 'Module not found' error in v0" | ✅ PROCEED | v0 + technical error = active development (v12 change) |

## Expected Outcomes

### Posts That Will Now Score Higher:

From the latest run (conversation 68e81b75ab6c9a3ed0b3d001):

**Post #27 (Replit refactoring):**
- Before v12: Score 0/12
- After v12: Expected 5-7/12 ✅
  - Platform Alignment: 3 (Replit)
  - Urgency: 1-2 (fixing issues)
  - Problem-Solution Fit: 1 (refactoring)
  - Commercial Viability: 0-1
  - **Total: 5-7 points → Task created**

**Post #30 (Retool performance):**
- Before v12: Score 0/12
- After v12: Expected 4-6/12 ⚠️ (might be below 6 threshold)
  - Platform Alignment: 2 (Retool)
  - Urgency: 2 (user experiencing issues)
  - Problem-Solution Fit: 0-1 (performance, not directly collab)
  - Commercial Viability: 1 ("our solution" implies business)
  - **Total: 5-6 points → Borderline**

### Overall Impact:

**Before v12:**
- 0% task creation rate (0/31 posts)
- False negatives: 2-3 posts (6-10%)

**After v12 (expected):**
- 10-20% task creation rate (3-6 tasks from 31 posts)
- Fewer false negatives (catching legitimate developers)
- Still correctly filtering marketing/thought leadership

## Verification

To verify v12 is working, look for these patterns in logs:

**Posts that should NOW score 6+:**
- "Refactoring X with [platform]"
- "Our [platform] solution has [issue]"
- "How do I fix [technical problem] in my app?"
- Any mention of "my app", "our solution", "my project"

**Posts that should STILL score 0:**
- Pure marketing/announcements (no dev context)
- Thought leadership about industry trends
- Networking/hiring posts
- Educational content with no personal project

## Version History

- **v10:** Too conservative, "Default to Skip" mentality
- **v11:** Added PASS rules for platform mentions, but kept strict "What Are They Building?" test
- **v12:** Changed to "Are They Doing Development Work?" - passes ANY development activity

## Next Steps

1. ✅ Updated MongoDB to v12
2. ⏳ Restart server to reload config (if needed)
3. ⏳ Run test job with larger dataset
4. ⏳ Verify 10-20% task creation rate
5. ⏳ Monitor for false positives (noise passing through)

## Cost Impact

No change to cost structure:
- Haiku filtering: Still ~40-50% (unchanged)
- Prompt caching: Still 90% savings (unchanged)
- **Only impact:** More posts will score 6+ and create tasks (which is the goal!)

Expected: 3-6 more tasks per 30-post batch = 10-20% task creation rate (vs 0% before)
