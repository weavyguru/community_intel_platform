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
