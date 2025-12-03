const { getClaudeClient } = require('../config/claude');
const { getOpenAIClient } = require('../config/openai');
const claudeService = require('./claudeService');
const chromaService = require('./chromaService');
const Persona = require('../models/Persona');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

/**
 * Sanitize a string to remove invalid Unicode surrogate pairs
 */
function sanitizeUnicode(str) {
    if (typeof str !== 'string') return str;
    if (str.length === 0) return str;

    let result = '';
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);

        if (code >= 0xD800 && code <= 0xDFFF) {
            if (code <= 0xDBFF) {
                if (i + 1 < str.length) {
                    const nextCode = str.charCodeAt(i + 1);
                    if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
                        result += str[i] + str[i + 1];
                        i++;
                        continue;
                    }
                }
            }
            continue;
        }

        result += str[i];
    }

    return result;
}

/**
 * Retry wrapper for API calls
 */
async function withRetry(apiCall, maxRetries = 3, baseDelay = 2000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiCall();
        } catch (error) {
            lastError = error;
            const isOverloaded = error.status === 529 ||
                (error.error?.error?.type === 'overloaded_error');
            const shouldRetry = error.headers?.['x-should-retry'] === 'true' || isOverloaded;

            if (shouldRetry && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`[Retry] API overloaded, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    throw lastError;
}

/**
 * Search for post content - reuses blog search strategy
 */
async function searchForPostContent(userQuery, statusCallback = null) {
    const log = [];
    const logStep = (step, status, message, data = {}) => {
        const entry = { step, timestamp: new Date(), status, message, ...data };
        log.push(entry);
        if (statusCallback) statusCallback(entry);
        console.log(`[Post Search] ${step}: ${message}`);
    };

    try {
        // Set up 90 day time window
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        const startUnix = Math.floor(startDate.getTime() / 1000);
        const endUnix = Math.floor(endDate.getTime() / 1000);

        logStep('time_window', 'complete', `Searching last 90 days (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);

        // Generate search strategy
        logStep('strategy', 'start', 'Generating search strategy with Claude Haiku 4.5...');

        const searchPlan = await claudeService.analyzeSearchIntent(userQuery, null);

        logStep('strategy', 'complete',
            `Strategy created: ${searchPlan.searchQueries.length} queries`,
            { queries: searchPlan.searchQueries.map(q => q.query) }
        );

        // Execute search
        const allResults = [];
        const seenDeeplinks = new Set();
        const maxIterations = 4;
        let currentIteration = 1;

        for (const queryPlan of searchPlan.searchQueries) {
            if (currentIteration > maxIterations) break;

            logStep('search', 'iteration_start', `Search iteration ${currentIteration}: "${queryPlan.query}"`, {
                iteration: currentIteration
            });

            // Build filters
            const filters = {
                startDate: startDate,
                endDate: endDate
            };

            if (queryPlan.platforms && queryPlan.platforms.length > 0) {
                filters.platforms = queryPlan.platforms;
            }

            const results = await chromaService.searchSemantic(
                queryPlan.query,
                30,
                filters
            );

            let newResults = 0;
            for (const result of results) {
                const deeplink = result.metadata?.deeplink;
                if (deeplink && !seenDeeplinks.has(deeplink)) {
                    seenDeeplinks.add(deeplink);
                    allResults.push({
                        platform: result.metadata?.platform,
                        deeplink: deeplink,
                        content: result.content,
                        timestamp: result.metadata?.timestamp_unix ? new Date(result.metadata.timestamp_unix * 1000) : new Date(),
                        relevance_score: result.relevanceScore
                    });
                    newResults++;
                }
            }

            logStep('search', 'iteration_complete', `Found ${newResults} new results (${allResults.length} total)`, {
                iteration: currentIteration,
                newResults,
                totalResults: allResults.length
            });

            currentIteration++;
        }

        logStep('search', 'complete', `Search complete: ${allResults.length} unique results`);

        return {
            results: allResults.slice(0, 100),
            log,
            timeWindow: { startDate: startDate.toISOString(), endDate: endDate.toISOString() }
        };

    } catch (error) {
        logStep('error', 'failed', `Search failed: ${error.message}`);
        throw error;
    }
}

/**
 * Generate an AI image using DALL-E
 */
async function generatePostImage(topic, statusCallback = null) {
    const logStep = (step, status, message) => {
        if (statusCallback) statusCallback({ step, status, message });
        console.log(`[Post Image] ${step}: ${message}`);
    };

    const openai = getOpenAIClient();
    if (!openai) {
        logStep('image', 'skipped', 'OpenAI not configured - skipping image generation');
        return { imageUrl: null, imagePrompt: null };
    }

    try {
        logStep('image', 'prompt', 'Creating image prompt with Claude...');

        const anthropic = getClaudeClient();
        const promptResponse = await withRetry(() => anthropic.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 500,
            messages: [{
                role: 'user',
                content: `Create a DALL-E image prompt for a social media post about: "${sanitizeUnicode(topic)}".

Requirements:
- Professional, modern, and visually engaging
- Suitable for LinkedIn, Twitter, and other social platforms
- Abstract or conceptual (avoid text in the image)
- Bright, appealing colors
- Should work as a header/banner image

Return ONLY the image prompt text, nothing else.`
            }]
        }));

        const imagePrompt = promptResponse.content[0].text.trim();
        logStep('image', 'generating', `Generating image with DALL-E 3: "${imagePrompt.substring(0, 50)}..."`);

        const image = await openai.images.generate({
            model: "dall-e-3",
            prompt: imagePrompt,
            n: 1,
            size: "1792x1024",
            quality: "standard"
        });

        const dalleUrl = image.data[0].url;

        // Download and save locally
        logStep('image', 'saving', 'Saving image locally...');
        const imageUrl = await saveImageLocally(dalleUrl);

        logStep('image', 'complete', 'Image generated successfully');

        return { imageUrl, imagePrompt };

    } catch (error) {
        logStep('image', 'error', `Image generation failed: ${error.message}`);
        console.error('[Post Image] Error:', error);
        return { imageUrl: null, imagePrompt: null };
    }
}

/**
 * Download image from URL and save locally
 */
async function saveImageLocally(url) {
    const outputDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'post-images');
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `post-${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);

    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                https.get(response.headers.location, (redirectResponse) => {
                    const chunks = [];
                    redirectResponse.on('data', chunk => chunks.push(chunk));
                    redirectResponse.on('end', async () => {
                        await fs.writeFile(outputPath, Buffer.concat(chunks));
                        resolve(`/uploads/post-images/${filename}`);
                    });
                    redirectResponse.on('error', reject);
                }).on('error', reject);
            } else {
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', async () => {
                    await fs.writeFile(outputPath, Buffer.concat(chunks));
                    resolve(`/uploads/post-images/${filename}`);
                });
                response.on('error', reject);
            }
        }).on('error', reject);
    });
}

/**
 * Get persona by ID
 */
async function getPersonaById(personaId) {
    if (!personaId) return null;
    try {
        return await Persona.findById(personaId).lean();
    } catch (error) {
        console.error('Error fetching persona:', error);
        return null;
    }
}

/**
 * Generate a single standalone post
 */
async function generateStandalonePost(userQuery, searchResults, platform, persona, charLength = '1200-1800') {
    console.log(`[Post Gen] Generating for "${platform.name}" with persona "${persona?.name || 'Neutral'}" (${charLength} chars)`);

    const anthropic = getClaudeClient();

    // Build persona instruction
    let personaInstruction = '';
    if (persona && persona.postModifier) {
        personaInstruction = `\n\nIMPORTANT - WRITING PERSONA: You MUST write this post using the following voice and style. This persona takes priority over other guidelines:\n${sanitizeUnicode(persona.postModifier)}`;
    }

    // Prepare search context
    const contextSources = searchResults.slice(0, 30).map((result, idx) => {
        return `[${idx + 1}] ${sanitizeUnicode(result.platform || 'Unknown')}: ${sanitizeUnicode(result.content || '').substring(0, 500)}`;
    }).join('\n\n');

    const sanitizedQuery = sanitizeUnicode(userQuery);
    const sanitizedPlatformName = sanitizeUnicode(platform.name);
    const sanitizedPlatformInstructions = sanitizeUnicode(platform.instructions || '');

    const prompt = `You are a social media content creator. Create a social media post based on community insights.
${personaInstruction}

Platform: ${sanitizedPlatformName}

Platform-Specific Instructions:
${sanitizedPlatformInstructions}

User's Topic/Request:
${sanitizedQuery}

Community Insights (use these for context and specific examples):
${contextSources}

Requirements:
- Create exactly 1 social media post
- The post MUST be between ${charLength} characters (this is strict)
- Reference specific insights from the community data where relevant
- The post should be engaging and encourage interaction
- Include relevant emojis where appropriate for the platform
- Do NOT include placeholder hashtags like #YourCompany - only include real, relevant hashtags
- Make the post complete and ready to publish

Return your response as valid JSON only (no markdown, no code blocks):
{
  "post": "The social post content (${charLength} chars)..."
}`;

    const sanitizedPrompt = sanitizeUnicode(prompt);

    const message = await withRetry(() => anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        messages: [{
            role: 'user',
            content: sanitizedPrompt
        }]
    }));

    const responseText = message.content[0].text;

    // Parse JSON response
    let result;
    try {
        const cleanedResponse = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        result = JSON.parse(cleanedResponse);
    } catch (parseError) {
        console.error('[Post Gen] Failed to parse response:', parseError.message);
        throw new Error('Invalid JSON response from Claude');
    }

    if (!result.post) {
        throw new Error('No post generated from Claude');
    }

    console.log(`[Post Gen] Generated post for "${platform.name}" (${result.post.length} chars)`);

    return result.post;
}

module.exports = {
    searchForPostContent,
    generatePostImage,
    generateStandalonePost,
    getPersonaById
};
