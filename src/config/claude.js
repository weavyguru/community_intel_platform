const Anthropic = require('@anthropic-ai/sdk');

let claudeClient = null;

const getClaudeClient = () => {
  if (claudeClient) {
    return claudeClient;
  }

  claudeClient = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
  });

  console.log('Claude client initialized successfully');
  return claudeClient;
};

const getClaudeModel = () => {
  return process.env.CLAUDE_MODEL || 'claude-opus-4-20250514';
};

module.exports = { getClaudeClient, getClaudeModel };
