const { getClaudeClient, getClaudeModel } = require('../config/claude');
const branding = require('../config/branding');

/**
 * Sanitize a string to remove invalid Unicode surrogate pairs
 * This prevents JSON encoding errors when sending to Claude API
 * ALWAYS processes the string - JSON.stringify doesn't catch lone surrogates in Node.js
 */
function sanitizeUnicode(str) {
  if (typeof str !== 'string') return str;
  if (str.length === 0) return str;

  // ALWAYS clean - Node.js JSON.stringify doesn't throw for lone surrogates
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    // Handle surrogate pairs
    if (code >= 0xD800 && code <= 0xDFFF) {
      // High surrogate (U+D800 to U+DBFF)
      if (code <= 0xDBFF) {
        // Check if next char is a valid low surrogate
        if (i + 1 < str.length) {
          const nextCode = str.charCodeAt(i + 1);
          if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
            // Valid surrogate pair - keep both characters
            result += str[i] + str[i + 1];
            i++; // Skip the low surrogate on next iteration
            continue;
          }
        }
      }
      // Lone surrogate (high without low, or low without preceding high)
      // Skip it entirely - don't add anything
      continue;
    }

    // Normal character - keep it
    result += str[i];
  }

  return result;
}

class ClaudeService {
  constructor() {
    this.client = null;
    this.model = getClaudeModel();
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  getClient() {
    if (!this.client) {
      this.client = getClaudeClient();
    }
    return this.client;
  }

  async askWithContext(question, chromaResults, instructions) {
    try {
      const context = this._buildContext(chromaResults);

      const systemPrompt = instructions || 'You are a helpful AI assistant analyzing community feedback.';
      // Sanitize question to prevent JSON encoding errors from invalid Unicode
      const sanitizedQuestion = sanitizeUnicode(question || '');

      const userMessage = `Based on the following community content, please answer this question: ${sanitizedQuestion}

Community Content:
${context}

Please provide a comprehensive answer with relevant quotes and insights.`;

      const response = await this._callClaudeWithRetry({
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }],
        max_tokens: 4096
      });

      return {
        answer: response.content[0].text,
        usage: response.usage,
        sources: chromaResults.map(r => ({
          id: r.id,
          platform: r.metadata?.platform,
          relevance: r.relevanceScore
        }))
      };
    } catch (error) {
      console.error('Error in askWithContext:', error);
      throw error;
    }
  }

  async analyzeIntent(text) {
    try {
      // Sanitize content to prevent JSON encoding errors from invalid Unicode
      const sanitizedText = sanitizeUnicode(text || '');

      const response = await this._callClaudeWithRetry({
        system: 'You are an AI that identifies user intent from text. Respond with a single intent category.',
        messages: [{
          role: 'user',
          content: `Analyze this text and identify the primary intent. Choose from: feature_request, bug_report, question, feedback, competitive_intel, pricing_inquiry, integration_question, other.

Text: ${sanitizedText}

Respond with only the intent category, no explanation.`
        }],
        max_tokens: 50
      });

      return response.content[0].text.trim().toLowerCase();
    } catch (error) {
      console.error('Error analyzing intent:', error);
      return 'other';
    }
  }

  async summarizeContent(content, maxLength = 200) {
    try {
      // Sanitize content to prevent JSON encoding errors from invalid Unicode
      const sanitizedContent = sanitizeUnicode(content || '');

      const response = await this._callClaudeWithRetry({
        system: 'You are an AI that creates concise summaries.',
        messages: [{
          role: 'user',
          content: `Summarize this content in ${maxLength} characters or less:\n\n${sanitizedContent}`
        }],
        max_tokens: 150
      });

      return response.content[0].text.trim();
    } catch (error) {
      console.error('Error summarizing content:', error);
      return content.substring(0, maxLength) + '...';
    }
  }

  async identifyTrends(documents, instructions) {
    try {
      const context = this._buildContext(documents);
      // Sanitize instructions to prevent JSON encoding errors from invalid Unicode
      const sanitizedInstructions = sanitizeUnicode(instructions || '');

      const systemPrompt = sanitizedInstructions || 'You are an AI that identifies trends and patterns in community discussions.';

      const userMessage = `Analyze the following community content and identify key trends, patterns, and actionable insights:

${context}

Provide:
1. Top 3-5 trends
2. Actionable insights for each trend
3. Priority level (high/medium/low) for each`;

      const response = await this._callClaudeWithRetry({
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }],
        max_tokens: 2048
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Error identifying trends:', error);
      throw error;
    }
  }

  async generateTaskFromContent(content, metadata, instructions) {
    try {
      const systemPrompt = instructions || 'You are an AI that creates actionable tasks from community content.';
      // Sanitize content to prevent JSON encoding errors from invalid Unicode
      const sanitizedContent = sanitizeUnicode(content || '');

      const userMessage = `Analyze this community content and determine if it requires action from the ${branding.teamName}:

Content: ${sanitizedContent}
Platform: ${metadata.platform || 'Unknown'}
Author: ${metadata.author || 'Unknown'}
Engagement: ${metadata.engagement || 0}

If action is needed, respond in JSON format:
{
  "needsAction": true/false,
  "title": "Brief task title",
  "intent": "intent category",
  "priority": "high/medium/low",
  "reasoning": "Why this needs attention"
}

If no action needed, respond: {"needsAction": false}`;

      const response = await this._callClaudeWithRetry({
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }],
        max_tokens: 500
      });

      const result = JSON.parse(response.content[0].text);

      if (result.needsAction) {
        return {
          title: result.title,
          snippet: content.substring(0, 300),
          intent: result.intent,
          priority: result.priority,
          metadata: {
            ...metadata,
            aiReasoning: result.reasoning
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Error generating task:', error);
      return null;
    }
  }

  async _callClaudeWithRetry(params, attempt = 1) {
    try {
      const client = this.getClient();

      const response = await client.messages.create({
        model: this.model,
        ...params
      });

      return response;
    } catch (error) {
      if (attempt < this.maxRetries && this._isRetryableError(error)) {
        console.log(`Claude API call failed, retrying (${attempt}/${this.maxRetries})...`);
        await this._sleep(this.retryDelay * attempt);
        return this._callClaudeWithRetry(params, attempt + 1);
      }
      throw error;
    }
  }

  _isRetryableError(error) {
    // Retry on rate limits and temporary server errors
    return error.status === 429 || error.status >= 500;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async quickFilterWithHaiku(source) {
    try {
      // Sanitize content to prevent JSON encoding errors
      const sanitizedContent = sanitizeUnicode(source.content || '');

      const filterPrompt = `Quickly filter this post to remove obvious noise. Be PERMISSIVE - when in doubt, PASS it.

**Post:**
Platform: ${source.platform}
Author: ${source.author}
Content: ${sanitizedContent}

**PASS (default for anything development-related):**
- ANY mention of building/creating/working on apps, tools, websites, services, projects
- "I built X" OR "I'm building X" (both pass - don't distinguish announcements vs active work)
- Questions about implementing features in their work
- Problems with their development/project
- Individual creators sharing what they made (even if showcasing)
- Questions about capabilities for their use case
- Seeking help, advice, or contractors for their project
- Technical questions related to software development
- App ideas or planning stages

**SKIP (only obvious noise):**
- COMPANY press releases or announcements from organizations (not individuals)
- Marketing/brand strategy posts from businesses
- Research institution announcements (papers, breakthroughs)
- Industry news articles or platform update announcements
- Pure educational "What is X?" with no building context
- Job postings or hiring announcements
- Comments/replies in discussion threads
- Completely off-topic to software development

**Critical: Be PERMISSIVE. If post mentions ANY app/project/tool they're working on, PASS it. Trust the next stage to score it properly.**

Respond ONLY with valid JSON:
{
  "shouldAnalyze": true/false,
  "reason": "brief reason (10 words max)",
  "appType": "type of app they're building, or 'company-announcement/news/job-posting' if noise"
}`;

      const response = await this._callClaudeWithRetry({
        model: 'claude-3-5-haiku-20241022',
        system: 'You are a fast filter for post classification. Respond only with valid JSON.',
        messages: [{
          role: 'user',
          content: filterPrompt
        }],
        max_tokens: 150
      });

      const text = response.content[0].text.trim();
      const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(cleanJson);

      return {
        shouldAnalyze: result.shouldAnalyze,
        reason: result.reason,
        appType: result.appType,
        usage: response.usage
      };
    } catch (error) {
      console.error('Error in quick filter:', error);
      // Default to analyzing if filter fails (safer)
      return {
        shouldAnalyze: true,
        reason: 'Filter error - defaulting to analyze',
        appType: 'unknown',
        usage: null
      };
    }
  }

  async analyzeForTask(prompt) {
    try {
      const response = await this._callClaudeWithRetry({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
        system: 'You are a community engagement analyst. Analyze posts and provide structured JSON responses.',
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 1024
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Error analyzing for task:', error);
      throw error;
    }
  }

  async analyzeForTaskWithCache(instructions, valuePropositions, postContent) {
    try {
      // Sanitize all content to prevent JSON encoding errors from invalid Unicode
      const sanitizedInstructions = sanitizeUnicode(instructions || '');
      const sanitizedValueProps = sanitizeUnicode(valuePropositions || '');
      const sanitizedPostContent = sanitizeUnicode(postContent || '');

      // Use prompt caching for static instructions + value props (7,862 tokens cached)
      // Only post content is variable (~300 tokens per request)
      // Caching saves 90% on input tokens: $15/1M → $1.50/1M
      const response = await this._callClaudeWithRetry({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
        system: [
          {
            type: "text",
            text: sanitizedInstructions,
            cache_control: { type: "ephemeral" }
          },
          {
            type: "text",
            text: `## WEAVY CONTEXT:\n${sanitizedValueProps}`,
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [{
          role: 'user',
          content: sanitizedPostContent
        }],
        max_tokens: 1024
      });

      // Log cache usage metrics
      const cacheWrite = response.usage?.cache_creation_input_tokens || 0;
      const cacheRead = response.usage?.cache_read_input_tokens || 0;
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;

      console.log(`[Cache] Write: ${cacheWrite} | Read: ${cacheRead} | Input: ${inputTokens} | Output: ${outputTokens}`);

      return {
        text: response.content[0].text,
        usage: response.usage
      };
    } catch (error) {
      console.error('Error analyzing for task with cache:', error);
      throw error;
    }
  }

  async askSimple(prompt) {
    try {
      // Sanitize prompt to prevent JSON encoding errors from invalid Unicode
      const sanitizedPrompt = sanitizeUnicode(prompt || '');

      const response = await this._callClaudeWithRetry({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
        messages: [{
          role: 'user',
          content: sanitizedPrompt
        }],
        max_tokens: 4096
      });

      return {
        answer: response.content[0].text,
        usage: response.usage
      };
    } catch (error) {
      console.error('Error in askSimple:', error);
      throw error;
    }
  }

  async generateTitle(question) {
    try {
      const client = this.getClient();
      // Sanitize content to prevent JSON encoding errors from invalid Unicode
      const sanitizedQuestion = sanitizeUnicode(question || '');

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Generate a concise 4-6 word title for this question. Only respond with the title, nothing else:\n\n${sanitizedQuestion}`
        }]
      });

      return response.content[0].text.trim();
    } catch (error) {
      console.error('Error generating title:', error);
      // Fallback to first words of question
      return question.split(' ').slice(0, 6).join(' ');
    }
  }

  async evaluateSearchResults(question, currentResults, searchPlan, iteration) {
    try {
      const client = this.getClient();

      const systemPrompt = `You are an expert search analyst. Evaluate search results and determine if additional searches are needed to comprehensively answer the user's question.`;

      // Build summary of current results
      const platformCounts = {};
      currentResults.forEach(result => {
        const platform = result.metadata?.platform || 'unknown';
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      });

      const resultsSummary = {
        totalResults: currentResults.length,
        platformDistribution: platformCounts,
        iteration: iteration
      };

      // Sanitize question to prevent JSON encoding errors from invalid Unicode
      const sanitizedQuestion = sanitizeUnicode(question || '');

      const userMessage = `Evaluate these search results for completeness:

Original Question: "${sanitizedQuestion}"

Current Results Summary:
- Total results: ${resultsSummary.totalResults}
- Platform distribution: ${JSON.stringify(resultsSummary.platformDistribution, null, 2)}
- Current iteration: ${resultsSummary.iteration}
- Target minimum results: ${searchPlan.coverageGoals?.minimumResults || 25}

Original Search Plan:
- Query complexity: ${searchPlan.queryComplexity}
- Expected iterations: ${searchPlan.expectedIterations}
- Coverage goals: ${JSON.stringify(searchPlan.coverageGoals, null, 2)}

Sample of results (first 3):
${currentResults.slice(0, 3).map((r, i) => `${i + 1}. Platform: ${r.metadata?.platform}, Content: ${sanitizeUnicode(r.content || '').substring(0, 150)}...`).join('\n')}

Respond ONLY with valid JSON:
{
  "isComplete": true/false,
  "confidence": 0-100,
  "coverageGaps": ["gap1", "gap2"],
  "reasoning": "detailed explanation",
  "recommendedQueries": [
    {
      "query": "follow-up query text",
      "platforms": ["platform"] or null,
      "reason": "why this query fills gaps",
      "searchType": "broad|specific|comparative|sentiment"
    }
  ]
}`;

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022', // Use Haiku for simple evaluation
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const jsonText = response.content[0].text.trim();
      const cleanJson = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      console.log('Search evaluation:', JSON.stringify(parsed, null, 2));

      return {
        ...parsed,
        usage: response.usage
      };
    } catch (error) {
      console.error('Error evaluating search results:', error);
      // Default to complete if evaluation fails
      return {
        isComplete: true,
        confidence: 50,
        coverageGaps: [],
        reasoning: 'Evaluation failed, proceeding with current results',
        recommendedQueries: []
      };
    }
  }

  async analyzeSearchIntent(question, availablePlatforms) {
    try {
      const client = this.getClient();

      const platformsList = availablePlatforms && availablePlatforms.length > 0
        ? availablePlatforms.join(', ')
        : 'all platforms';

      const systemPrompt = `You are an expert search strategist. Analyze the user's question and generate a comprehensive, multi-layered search strategy.

Available platforms: ${platformsList}

Respond ONLY with valid JSON in this exact format:
{
  "queryComplexity": "simple|moderate|complex|very_complex",
  "searchQueries": [
    {
      "query": "optimized search query text",
      "platforms": ["platform1", "platform2"] or null,
      "reason": "why this specific query",
      "searchType": "broad|specific|comparative|sentiment"
    }
  ],
  "reasoning": "detailed strategy explanation",
  "expectedIterations": number,
  "coverageGoals": {
    "platformCoverage": "all|specific|comparative",
    "topicBreadth": "narrow|moderate|comprehensive",
    "minimumResults": number
  }
}

Rules:
- Analyze question complexity and determine if iterative search is needed
- For broad questions (e.g., "most common problem"): generate diverse query angles (issues, errors, complaints, bugs, problems)
- For cross-platform comparative questions: create platform-specific queries with consistent search terms
- For sentiment questions: include sentiment-oriented search terms
- Generate 3-10 initial queries depending on complexity
- Plan for follow-up iterations if topic is broad or comparative
- Optimize query text for semantic search (focus on key concepts)`;

      // Sanitize question to prevent JSON encoding errors from invalid Unicode
      const sanitizedQuestion = sanitizeUnicode(question || '');

      const userMessage = `Generate a comprehensive search strategy for this question:

Question: "${sanitizedQuestion}"

Available platforms: ${platformsList}
Total platforms: ${availablePlatforms && availablePlatforms.length > 0 ? availablePlatforms.length : 'all'}

Analyze the question's:
1. Scope (single topic vs. broad analysis)
2. Comparison needs (single platform vs. cross-platform)
3. Depth required (quick answer vs. comprehensive analysis)
4. Whether iterative search would improve results

Respond with ONLY the JSON object.`;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5', // Use Haiku 4.5 for blog search
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const jsonText = response.content[0].text.trim();
      console.log('Raw Haiku search strategy response:', jsonText);

      // Remove markdown code blocks if present
      const cleanJson = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const parsed = JSON.parse(cleanJson);
      console.log('Parsed search plan:', JSON.stringify(parsed, null, 2));

      return {
        ...parsed,
        usage: response.usage
      };
    } catch (error) {
      console.error('Error analyzing search intent:', error);
      console.error('Error details:', error.message);
      // Fallback to simple single query
      return {
        queryComplexity: 'simple',
        searchQueries: [{
          query: question,
          platforms: null,
          reason: 'Fallback due to intent analysis error',
          searchType: 'broad'
        }],
        reasoning: 'Using fallback strategy due to error',
        expectedIterations: 1,
        coverageGoals: {
          platformCoverage: 'all',
          topicBreadth: 'moderate',
          minimumResults: 10
        }
      };
    }
  }

  _buildContext(results) {
    if (!results || results.length === 0) {
      return 'No relevant content found.';
    }

    return results.map((result, index) => {
      const metadata = result.metadata || {};
      // Sanitize content to remove invalid Unicode surrogate pairs
      const sanitizedContent = sanitizeUnicode(result.content || result.documents || '');
      return `
[Source ${index + 1}]
Platform: ${metadata.platform || 'Unknown'}
Author: ${metadata.author || 'Unknown'}
Date: ${metadata.timestamp || 'Unknown'}
Content: ${sanitizedContent}
---`;
    }).join('\n');
  }
}

module.exports = new ClaudeService();
