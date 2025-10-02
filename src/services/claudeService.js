const { getClaudeClient, getClaudeModel } = require('../config/claude');

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

      const userMessage = `Based on the following community content, please answer this question: ${question}

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
      const response = await this._callClaudeWithRetry({
        system: 'You are an AI that identifies user intent from text. Respond with a single intent category.',
        messages: [{
          role: 'user',
          content: `Analyze this text and identify the primary intent. Choose from: feature_request, bug_report, question, feedback, competitive_intel, pricing_inquiry, integration_question, other.

Text: ${text}

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
      const response = await this._callClaudeWithRetry({
        system: 'You are an AI that creates concise summaries.',
        messages: [{
          role: 'user',
          content: `Summarize this content in ${maxLength} characters or less:\n\n${content}`
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

      const systemPrompt = instructions || 'You are an AI that identifies trends and patterns in community discussions.';

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

      const userMessage = `Analyze this community content and determine if it requires action from the Weavy team:

Content: ${content}
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

  async generateTitle(question) {
    try {
      const client = this.getClient();

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Generate a concise 4-6 word title for this question. Only respond with the title, nothing else:\n\n${question}`
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

      const userMessage = `Evaluate these search results for completeness:

Original Question: "${question}"

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
${currentResults.slice(0, 3).map((r, i) => `${i + 1}. Platform: ${r.metadata?.platform}, Content: ${r.content.substring(0, 150)}...`).join('\n')}

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
        model: this.model, // Use Sonnet 4.5
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

      const systemPrompt = `You are an expert search strategist using Claude Opus 4. Analyze the user's question and generate a comprehensive, multi-layered search strategy.

Available platforms: ${availablePlatforms.join(', ')}

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

      const userMessage = `Generate a comprehensive search strategy for this question:

Question: "${question}"

Available platforms: ${availablePlatforms.join(', ')}
Total platforms: ${availablePlatforms.length}

Analyze the question's:
1. Scope (single topic vs. broad analysis)
2. Comparison needs (single platform vs. cross-platform)
3. Depth required (quick answer vs. comprehensive analysis)
4. Whether iterative search would improve results

Respond with ONLY the JSON object.`;

      const response = await client.messages.create({
        model: this.model, // Use Sonnet 4.5
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const jsonText = response.content[0].text.trim();
      console.log('Raw Sonnet search strategy response:', jsonText);

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
      return `
[Source ${index + 1}]
Platform: ${metadata.platform || 'Unknown'}
Author: ${metadata.author || 'Unknown'}
Date: ${metadata.timestamp || 'Unknown'}
Content: ${result.content || result.documents}
---`;
    }).join('\n');
  }
}

module.exports = new ClaudeService();
