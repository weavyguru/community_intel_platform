/**
 * Update AgentConfig to v13 - Three-Tier Help Strategy
 *
 * Key Changes:
 * - Restructured scoring matrix to value "helpfulness" independent of Weavy fit
 * - Lower threshold from 6 to 4 points
 * - Three tiers: Pure Help (4-5), Help + Sprinkle (6-8), Strong Fit (9-12)
 * - Add responseType field to JSON output
 *
 * Run with: node update_scoring_v13.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { AgentConfig } = require('./src/models/AgentConfig');

async function updateToV13() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const taskConfig = await AgentConfig.findOne({ type: 'create-tasks' });

    if (!taskConfig) {
      console.log('❌ No create-tasks agent config found');
      process.exit(1);
    }

    console.log('Current version:', taskConfig.currentVersion);
    console.log('Updating to v13 - Three-Tier Help Strategy...\n');

    let updatedInstructions = taskConfig.instructions;

    // ==========================================
    // Change 1: Replace entire STEP 2 scoring matrix
    // ==========================================

    const oldScoringMatrix = `### STEP 2: Engagement Decision Matrix (Only for posts that passed Steps 0 & 1)

For posts marked 🟢 or 🟡, score them on these factors (1-3 points each):

**Problem-Solution Fit (Focus on app type & collaboration needs):**
- 3 points: Building app that needs collaboration (dating, team tool, social, SaaS with user interaction) OR exact problem Weavy solves (e.g., "need to add chat to my Lovable app")
- 2 points: Platform issues BUT actively building collaborative features OR adjacent problem (e.g., "real-time features are complex" while building team app)
- 1 point: Could potentially benefit from Weavy IF they're building something collaborative (must have clear app context)
- 0 points: Only platform complaints without app context OR building something without collaboration needs

**Urgency Indicators:**
- 3 points: Deadline mentioned, strong frustration evident, multiple failed attempts
- 2 points: Actively researching solutions OR expressing annoyance/frustration
- 1 point: Early exploration phase or casual mention

**Platform Alignment:**
- 3 points: Using Lovable, Replit, Bolt, v0, or similar rapid development platforms
- 2 points: Using React, Vue, Angular, low-code platforms, OR platform unclear but web-based
- 1 point: Platform mentioned but not web-focused

**Commercial Viability:**
- 3 points: B2B SaaS, enterprise, or professional tool clearly mentioned
- 2 points: Professional context implied OR unclear business model (default assumption)
- 1 point: Clearly hobbyist/personal project only

**Engagement Threshold:**
- **9-12 points**: High priority - craft detailed, personalized response
- **6-8 points**: Medium priority - provide helpful, concise response
- **<6 points**: Skip`;

    const newScoringMatrix = `### STEP 2: Three-Tier Help Strategy (Only for posts that passed Steps 0 & 1)

**PHILOSOPHY: Be helpful first. Build community presence. Sprinkle Weavy when it fits.**

We have three engagement tiers:
- **Pure Help (4-5 pts)**: Be helpful as fellow developers, NO Weavy mention - build presence
- **Help + Sprinkle (6-8 pts)**: Help first, then naturally mention Weavy as one option
- **Strong Fit (9-12 pts)**: Help-first tone, but Weavy is clearly relevant to their question

For posts marked 🟢 or 🟡, score them on these factors:

**Developer Engagement Value (0-4 points)** - How valuable is it to engage?
- 4 points: Explicitly building collaboration features (chat, messaging, team tools, dating apps, social platforms)
- 3 points: Building on AI platforms (Lovable, Bolt, v0, Replit, Cursor) - we can offer helpful insights
- 2 points: Building something web-based, asking for help/advice on development
- 1 point: Technical question about development work
- 0 points: Pure marketing/announcements, no development context

**Urgency/Engagement Quality (0-3 points)** - How engaged will they be?
- 3 points: Deadline mentioned, strong frustration evident, actively seeking solutions now
- 2 points: Asking for advice, expressing frustration, researching options
- 1 point: Casual question or early exploration
- 0 points: Just venting/complaining, no clear question

**Platform/Tech Fit (0-3 points)** - How well does tech align with Weavy?
- 3 points: Using Lovable, Bolt, v0, Replit, Cursor, or similar rapid development platforms
- 2 points: Using React, Vue, Angular, or other web frameworks
- 1 point: Web-based but unclear stack
- 0 points: Non-web platforms or completely unclear

**Commercial Context (0-2 points)** - Business context
- 2 points: Clearly B2B SaaS, enterprise tool, or professional product
- 1 point: Professional project or unclear business model (default assumption)
- 0 points: Explicitly hobby/learning project only

**NEW TOTAL: 12 points possible (4+3+3+2)**

**Engagement Thresholds:**
- **9-12 points**: STRONG FIT - Detailed response, Weavy is clearly relevant
- **6-8 points**: HELP + SPRINKLE - Helpful response, natural Weavy mention when it fits
- **4-5 points**: PURE HELP - Be helpful, NO Weavy mention, build community presence
- **<4 points**: Skip - Not valuable to engage`;

    updatedInstructions = updatedInstructions.replace(oldScoringMatrix, newScoringMatrix);

    // ==========================================
    // Change 2: Update STEP 3 Response Guidelines
    // ==========================================

    const oldResponseGuidelines = `#### HIGH PRIORITY Response Format (9-12 points):

**Structure (2-3 short paragraphs, under 150 words):**
- Address their specific situation
- Provide actionable insight or ask clarifying question
- Mention Weavy naturally if relevant (optional, don't force it)`;

    const newResponseGuidelines = `#### PURE HELP Response Format (4-5 points):

**Goal: Build community presence through helpfulness. Zero Weavy mentions.**

**Structure (1-2 paragraphs, under 100 words):**
- Answer their question or offer helpful perspective
- Share relevant experience or ask clarifying questions
- NO Weavy mention at all - just be a helpful fellow developer

**Example 1 (Building on Bolt):**
> "Bolt's error messages can be cryptic. Try checking the build logs in the deployment panel - usually there's a more detailed error buried there.
>
> What specific error are you seeing?"

**Example 2 (AI platform cost concerns):**
> "Token costs add up fast when you're iterating. I've found focusing prompts on unique business logic and using stable libraries for standard features helps keep costs down."

**Example 3 (Deployment issues):**
> "v0's deployment can be finicky with certain dependencies. Have you tried pinning your package versions? Sometimes the auto-upgrade breaks things."

#### HELP + SPRINKLE Response Format (6-8 points):

**Goal: Be helpful first, then naturally mention Weavy as one option.**

**Structure (2 paragraphs, under 120 words):**
- Address their specific situation helpfully
- Naturally mention Weavy as an option (not pushy, just "this might help")
- Keep Weavy mention brief and relevant

**Example 1 (Building team features):**
> "Building real-time team features from scratch is a 4-6 week project minimum. WebSockets, presence, and file sync are deceptively complex.
>
> Pre-built components like Weavy cut that to a few days. Or if you want full control, libraries like Socket.io give you the flexibility at the cost of more setup time."

**Example 2 (Dating app with AI platform):**
> "Dating apps need solid messaging - users expect it to just work. Building chat with AI platforms usually burns through tokens and still needs polish.
>
> Drop-in components can handle the chat infrastructure in about 10 minutes, letting you focus AI prompts on your matching algorithm instead. Weavy's one option, or there's Stream and Sendbird if you want to compare."

#### STRONG FIT Response Format (9-12 points):

**Goal: They're asking about what Weavy does. Be helpful, but Weavy is clearly the answer.**

**Structure (2-3 short paragraphs, under 150 words):**
- Address their specific situation
- Provide actionable insight or ask clarifying question
- Mention Weavy naturally as it directly solves their stated problem`;

    updatedInstructions = updatedInstructions.replace(oldResponseGuidelines, newResponseGuidelines);

    // ==========================================
    // Change 3: Remove old MEDIUM PRIORITY section (already covered by Help + Sprinkle)
    // ==========================================

    const oldMediumPriority = `#### MEDIUM PRIORITY Response Format (6-8 points):

**Structure (1-2 paragraphs, under 100 words):**
- Brief acknowledgment or direct answer
- One actionable suggestion
- Natural Weavy mention only if it genuinely helps

**Example 1:**
> "Bolt's deployment quirks can slow you down. Have you tried isolating which features are causing the failures?
>
> Sometimes building your core app in the platform but using external components for complex features (like real-time chat) helps avoid platform-specific bugs."

**Example 2:**
> "Adding chat to a dating app built with Lovable doesn't have to be complicated. Web Components work well because they integrate independently of whatever Lovable generates.
>
> Should be a 10-minute integration if you use pre-built components instead of prompting Lovable to build chat from scratch."

`;

    // Remove the MEDIUM PRIORITY section
    if (updatedInstructions.includes(oldMediumPriority)) {
      updatedInstructions = updatedInstructions.replace(oldMediumPriority, '');
    }

    // ==========================================
    // Change 4: Update JSON output format
    // ==========================================

    const oldJsonFormat = `## Output Format

For each analyzed post, provide:

\`\`\`json
{
  "shouldEngage": true/false,
  "score": <number out of 12>,
  "reasoning": "<1-2 sentences: 'This person is building [TYPE OF APP] which needs [SPECIFIC WEAVY COMPONENT: chat/feeds/files/copilot]. [Brief scoring justification]'>",
  "suggestedResponse": "<the response text if engaging, or empty string if not>"
}
\`\`\``;

    const newJsonFormat = `## Output Format

For each analyzed post, provide:

\`\`\`json
{
  "shouldEngage": true/false,
  "score": <number out of 12>,
  "responseType": "pure-help" | "help-with-sprinkle" | "strong-fit",
  "reasoning": "<1-2 sentences explaining score and response type>",
  "suggestedResponse": "<the response text if engaging, or empty string if not>"
}
\`\`\`

**Response Type Guidelines:**
- \`"pure-help"\` (4-5 points): NO Weavy mention, just helpful advice
- \`"help-with-sprinkle"\` (6-8 points): Help first, natural Weavy mention when relevant
- \`"strong-fit"\` (9-12 points): Weavy clearly solves their stated problem`;

    updatedInstructions = updatedInstructions.replace(oldJsonFormat, newJsonFormat);

    // ==========================================
    // Change 5: Update reasoning examples
    // ==========================================

    const oldReasoningExamples = `**Reasoning Template Examples:**
- ✅ GOOD: "This person is building a dating app which needs real-time chat/messaging (chat component). High urgency (deadline mentioned), using Lovable (3 pts platform), B2B SaaS context (3 pts commercial). Score: 11/12"
- ✅ GOOD: "This person is building an enterprise project management tool which needs team collaboration and activity feeds (feeds + chat components). Medium urgency, using v0, professional context. Score: 9/12"
- ❌ BAD: "User experiencing platform stability issues which aligns with Weavy's value prop around avoiding platform-specific deployment headaches." (No app type, no component connection)
- ❌ BAD: "Strong frustration with v0's agent mode causing production issues." (No app type identified, no collaboration need)`;

    const newReasoningExamples = `**Reasoning Template Examples:**

**Pure Help (4-5 points):**
- ✅ "Building on Bolt (3 pts dev value), asking about deployment (2 pts urgency), using rapid platform (3 pts tech). No collaboration context. Score: 5/12 - pure-help (be helpful, no Weavy)"
- ✅ "Refactoring app with Replit (3 pts dev value), casual question (1 pt urgency), web-based (2 pts tech). Score: 4/12 - pure-help"

**Help + Sprinkle (6-8 points):**
- ✅ "Building team tool with Lovable (4 pts dev value - implicit collaboration), researching options (2 pts urgency), rapid platform (3 pts tech). Score: 7/12 - help-with-sprinkle (mention Weavy naturally)"
- ✅ "Creating SaaS with user features (3 pts dev value), expressing frustration (2 pts urgency), using React (2 pts tech), B2B context (2 pts commercial). Score: 6/12 - help-with-sprinkle"

**Strong Fit (9-12 points):**
- ✅ "Building dating app with Lovable, needs messaging (4 pts dev value), deadline mentioned (3 pts urgency), rapid platform (3 pts tech), B2B (2 pts commercial). Score: 12/12 - strong-fit (Weavy directly solves this)"
- ✅ "Adding chat to enterprise tool (4 pts dev value), actively seeking solutions (3 pts urgency), using v0 (3 pts tech). Score: 10/12 - strong-fit"

❌ BAD Examples:
- "User experiencing platform stability issues" (No scoring breakdown, no response type)
- "Strong frustration with v0" (No context about what they're building, no score justification)`;

    updatedInstructions = updatedInstructions.replace(oldReasoningExamples, newReasoningExamples);

    // ==========================================
    // Save updated config
    // ==========================================

    taskConfig.instructions = updatedInstructions;
    taskConfig.currentVersion += 1;
    taskConfig.lastUpdated = new Date();

    await taskConfig.save();

    console.log('✅ Instructions updated successfully!');
    console.log('New version:', taskConfig.currentVersion);
    console.log('\n=== v13 Changes Summary ===');
    console.log('1. ✅ Restructured scoring matrix:');
    console.log('   - Developer Engagement Value (0-4 pts) - helpfulness independent of Weavy fit');
    console.log('   - Urgency/Quality (0-3 pts)');
    console.log('   - Platform/Tech Fit (0-3 pts)');
    console.log('   - Commercial Context (0-2 pts)');
    console.log('   - NEW TOTAL: 12 points\n');

    console.log('2. ✅ Three-tier engagement strategy:');
    console.log('   - 4-5 pts: PURE HELP (no Weavy mention)');
    console.log('   - 6-8 pts: HELP + SPRINKLE (natural Weavy mention)');
    console.log('   - 9-12 pts: STRONG FIT (Weavy clearly relevant)');
    console.log('   - <4 pts: Skip\n');

    console.log('3. ✅ Added responseType field to JSON output');
    console.log('   - "pure-help" | "help-with-sprinkle" | "strong-fit"\n');

    console.log('4. ✅ Lowered threshold from 6 to 4 points\n');

    console.log('5. ✅ Updated reasoning examples for all three tiers\n');

    console.log('=== Expected Outcomes ===');
    console.log('Before v13: 0-3% task creation (122/125 scored 0/12)');
    console.log('After v13: 15-25% task creation (~250-300 tasks from 1200 posts)');
    console.log('  - Pure help: ~80-100 tasks (build presence)');
    console.log('  - Help + sprinkle: ~100-150 tasks (gentle intro)');
    console.log('  - Strong fit: ~50-70 tasks (clear Weavy fit)');
    console.log('================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateToV13();
