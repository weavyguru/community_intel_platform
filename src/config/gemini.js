const { GoogleGenerativeAI } = require('@google/generative-ai');

let geminiClient = null;

function getGeminiClient() {
    if (!process.env.GOOGLE_API_KEY) {
        console.warn('GOOGLE_API_KEY not set - Gemini image generation disabled');
        return null;
    }
    if (!geminiClient) {
        geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    }
    return geminiClient;
}

module.exports = { getGeminiClient };
