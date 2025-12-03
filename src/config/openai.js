const OpenAI = require('openai');

let openaiClient = null;

const getOpenAIClient = () => {
    if (openaiClient) {
        return openaiClient;
    }

    if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY not set - image generation will be disabled');
        return null;
    }

    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    console.log('OpenAI client initialized successfully');
    return openaiClient;
};

module.exports = { getOpenAIClient };
