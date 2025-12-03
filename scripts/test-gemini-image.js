/**
 * Test script for Gemini image generation
 * Run with: node scripts/test-gemini-image.js
 */

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

async function main() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_API_KEY not set in .env');
        process.exit(1);
    }

    console.log('Initializing Google GenAI...');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Create a professional social media header image about developer tools and AI coding assistants.

Style: Modern, clean design. ZERO titles, headlines, sentences, or words.
Color palette: soft sky blue, muted sage green, warm golden yellow, and medium purple. Dark blue-gray background.`;

    console.log('Generating image with prompt:', prompt);
    console.log('Using model: models/imagen-4.0-ultra-generate-001');

    try {
        const response = await ai.models.generateImages({
            model: "imagen-4.0-ultra-generate-001",
            prompt: prompt,
            config: {
                aspectRatio: "16:9",
                numberOfImages: 1,
            }
        });

        console.log('Response received');
        console.log('Generated images:', response.generatedImages?.length || 0);

        if (!response.generatedImages || response.generatedImages.length === 0) {
            console.error('No images in response');
            console.log('Full response:', JSON.stringify(response, null, 2));
            return;
        }

        const image = response.generatedImages[0];
        console.log('Image found! MIME type:', image.mimeType || 'image/png');

        const imageData = image.image?.imageBytes;
        if (!imageData) {
            console.error('No image bytes found');
            console.log('Image object:', JSON.stringify(image, null, 2));
            return;
        }

        const buffer = Buffer.from(imageData, 'base64');
        const outputPath = path.join(__dirname, '..', 'public', 'uploads', 'post-images', 'test-gemini.png');
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, buffer);
        console.log('Image saved to:', outputPath);

        console.log('Done!');

    } catch (error) {
        console.error('Error:', error.message);
        console.error('Full error:', error);
    }
}

main();
