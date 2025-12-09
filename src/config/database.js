const mongoose = require('mongoose');
const branding = require('./branding');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Initialize default agent configs if they don't exist
    await initializeAgentConfigs();

    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

const initializeAgentConfigs = async () => {
  const { AgentConfig } = require('../models/AgentConfig');

  const askAgentExists = await AgentConfig.findOne({ type: 'ask' });
  if (!askAgentExists) {
    await AgentConfig.create({
      type: 'ask',
      instructions: `# Ask Agent Instructions

You are an AI assistant helping the ${branding.teamName} analyze community feedback and requests.

## Primary Objectives
1. **Identify User Intent** - Categorize requests as feature requests, issues, or questions
2. **Assess Business Impact** - Evaluate urgency and potential value
3. **Provide Actionable Insights** - Suggest concrete next steps
4. **Competitive Intelligence** - Highlight insights about other vibe coding platforms

## Response Format
- Start with a brief summary
- Use clear headings for different sections
- Include relevant quotes from source material
- End with recommended actions

## Key Areas to Monitor
- Feature requests for chat/collaboration features
- Integration questions
- Performance or reliability issues
- Comparisons with competitors (Lovable, Replit, etc.)`,
      currentVersion: 1
    });
    console.log('Initialized Ask Agent configuration');
  }

  const bgAgentExists = await AgentConfig.findOne({ type: 'background' });
  if (!bgAgentExists) {
    await AgentConfig.create({
      type: 'background',
      instructions: `# Background Agent Instructions

Monitor community activity across Discord, Reddit, X, and LinkedIn for actionable intelligence.

## Monitoring Priorities

### High Priority (Create Task Immediately)
- Direct mentions of @weavy or weavy.com
- Urgent bug reports or security issues
- High-engagement posts about chat/collaboration needs
- Competitive threats or opportunities

### Medium Priority (Create Task if Pattern Detected)
- Feature requests related to in-app communication
- Developer pain points with current solutions
- Trends in vibe coding platforms
- Questions about pricing or implementation

### Low Priority (Log but Don't Create Task)
- General discussions about development tools
- Positive mentions without specific asks
- Educational content opportunities

## Task Creation Criteria
A task should be created when:
1. Direct action is required from the ${branding.teamName}
2. Multiple users express the same need (trend detection)
3. Competitive intelligence requires strategic response
4. Time-sensitive opportunity exists

## Metadata to Capture
- Platform and author information
- Engagement metrics (likes, comments, shares)
- Sentiment analysis
- Related keywords and topics
- Potential business impact score`,
      currentVersion: 1,
      notificationSettings: {
        enabled: true,
        keywords: ['weavy', 'chat', 'collaboration', 'integration'],
        intents: ['feature_request', 'bug_report', 'competitive_intel'],
        minPriority: 'medium'
      }
    });
    console.log('Initialized Background Agent configuration');
  }
};

module.exports = connectDB;
