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

  async analyzeSearchIntent(question, availablePlatforms) {
    try {
      const client = this.getClient();

      const systemPrompt = `You are a search query generator. Analyze the user's question and generate the optimal search queries to answer it.

Available platforms: ${availablePlatforms.join(', ')}

Respond ONLY with valid JSON in this exact format:
{
  "searchQueries": [
    {
      "query": "optimized search query text",
      "platforms": ["platform1", "platform2"] or null,
      "reason": "why this specific query"
    }
  ],
  "reasoning": "overall strategy explanation"
}

Rules:
- Generate AS MANY search queries as needed to comprehensively answer the question
- For cross-platform comparative questions (e.g., "across all platforms", "compare platforms"):
  * Create ONE search query per platform with that platform in the "platforms" array
  * Use the same core search term for each platform to enable fair comparison
  * Extract the core topic/issue from the question
- For platform-specific questions:
  * Specify the platform(s) in the "platforms" array
- For general questions:
  * Use "platforms": null to search all data
- Optimize the query text for semantic search (remove filler words, focus on key concepts)`;

      const userMessage = `Generate search queries for this question:

Question: "${question}"

Available platforms: ${availablePlatforms.join(', ')}
Total platforms: ${availablePlatforms.length}

Examples:
1. "What is the most common issue across platforms?" → Generate ${availablePlatforms.length} queries (one per platform) with core search: "common issue" or "problem" or "error"
   - Query 1: {"query": "common issue", "platforms": ["${availablePlatforms[0]}"], "reason": "..."}
   - Query 2: {"query": "common issue", "platforms": ["${availablePlatforms[1]}"], "reason": "..."}
   - ... (one for each available platform)
2. "How do users feel about Lovable?" → Generate 1 query with platforms: ["lovable"]
3. "What are people saying about pricing?" → Generate 1 query with platforms: null

Respond with ONLY the JSON object.`;

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const jsonText = response.content[0].text.trim();
      console.log('Raw Haiku response:', jsonText);

      // Remove markdown code blocks if present
      const cleanJson = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('Cleaned JSON:', cleanJson);

      const parsed = JSON.parse(cleanJson);
      console.log('Parsed search plan:', JSON.stringify(parsed, null, 2));

      return parsed;
    } catch (error) {
      console.error('Error analyzing search intent:', error);
      console.error('Error details:', error.message);
      // Fallback to simple single query
      return {
        searchQueries: [{
          query: question,
          platforms: null,
          reason: 'Fallback due to intent analysis error'
        }],
        reasoning: 'Using fallback strategy due to error'
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
