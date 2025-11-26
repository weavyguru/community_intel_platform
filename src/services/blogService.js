const claudeService = require('./claudeService');
const chromaService = require('./chromaService');
const { selectIconsForTopic } = require('../lib/blogImageCreator/iconSelector');
const { generateVariations } = require('../lib/blogImageCreator/generator');
const { getClaudeClient } = require('../config/claude');
const BlogInstructions = require('../models/BlogInstructions');

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

/**
 * Get active blog instructions from database or use defaults
 */
async function getInstructions() {
    try {
        const instructions = await BlogInstructions.findOne({ isActive: true });
        if (instructions && instructions.instructions) {
            const parsed = JSON.parse(instructions.instructions);
            return {
                topicGeneration: parsed.topicGeneration,
                postGeneration: parsed.postGeneration
            };
        }
    } catch (error) {
        console.warn('Failed to load instructions from database, using defaults:', error.message);
    }

    // Default instructions
    return {
        topicGeneration: `You are a content strategist analyzing community feedback to suggest blog post topics.

Guidelines:
- Topics should address real pain points, questions, or interests shown in the data
- Titles should be specific and actionable (e.g., "5 Ways to Fix Authentication Errors in Lovable" not "Authentication Best Practices")
- Each topic should be distinct and cover different aspects
- Prioritize topics with clear evidence from multiple community posts
- Make topics practical and helpful`,

        postGeneration: `You are an expert technical content writer creating a blog post for a developer audience.

Guidelines:
- Write in a clear, engaging, conversational tone
- Use real examples and insights from the community data
- Include code examples where relevant (use proper HTML code blocks)
- Make it practical and actionable
- Length: 800-1500 words
- Use proper HTML formatting (h2, h3, p, ul, ol, code, pre, strong, em tags)
- Start with a compelling introduction
- Use subheadings to organize content
- End with a clear conclusion or call-to-action`
    };
}

/**
 * Search Chroma for content within the last 90 days based on user query
 * Uses the same iterative search strategy as the "Ask with Claude" feature
 */
async function searchForBlogContent(userQuery, platforms = null, statusCallback = null) {
    const log = [];
    const logStep = (step, status, message, data = {}) => {
        const entry = {
            step,
            timestamp: new Date(),
            status,
            message,
            ...data
        };
        log.push(entry);
        if (statusCallback) {
            statusCallback(entry);
        }
        console.log(`[Blog Search] ${step}: ${message}`);
    };

    try {
        // Calculate 90-day time window
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        const startUnix = Math.floor(startDate.getTime() / 1000);
        const endUnix = Math.floor(endDate.getTime() / 1000);

        logStep('time_window', 'complete', `Searching last 90 days (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);

        // Step 1: Generate search strategy
        logStep('strategy', 'start', 'Generating search strategy with Claude Sonnet 4.5...');

        const searchPlan = await claudeService.analyzeSearchIntent(userQuery, platforms);

        logStep('strategy', 'complete',
            `Strategy created: ${searchPlan.searchQueries.length} queries, expected ${searchPlan.expectedIterations} iterations`,
            {
                model: 'claude-sonnet-4-5-20250929',
                complexity: searchPlan.queryComplexity,
                queries: searchPlan.searchQueries.map(q => q.query)
            }
        );

        // Step 2: Execute iterative search
        const allResults = [];
        const seenDeeplinks = new Set();
        const maxIterations = 4;
        let currentIteration = 1;

        for (const queryPlan of searchPlan.searchQueries) {
            if (currentIteration > maxIterations) {
                logStep('search', 'limited', `Reached maximum iterations (${maxIterations}), stopping search`);
                break;
            }

            logStep('search', 'start',
                `Iteration ${currentIteration}: "${queryPlan.query}"`,
                { iteration: currentIteration, query: queryPlan.query }
            );

            try {
                // Build filters for Chroma search
                const filters = {
                    startDate: startDate,
                    endDate: endDate
                };

                if (queryPlan.platforms && queryPlan.platforms.length > 0) {
                    filters.platforms = queryPlan.platforms;
                } else if (platforms && platforms.length > 0) {
                    filters.platforms = platforms;
                }

                // Search Chroma
                const results = await chromaService.searchSemantic(
                    queryPlan.query,
                    50, // Get more results per query
                    filters
                );

                // Filter and deduplicate
                let newResults = 0;
                for (const result of results) {
                    const deeplink = result.metadata?.deeplink;
                    if (deeplink && !seenDeeplinks.has(deeplink)) {
                        seenDeeplinks.add(deeplink);
                        // Transform to expected format
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

                logStep('search', 'complete',
                    `Found ${newResults} new results (${allResults.length} total)`,
                    { iteration: currentIteration, newResults, totalResults: allResults.length }
                );

            } catch (error) {
                logStep('search', 'error', `Search failed: ${error.message}`, { iteration: currentIteration });
            }

            currentIteration++;
        }

        // Step 3: Evaluate if we have enough coverage
        if (allResults.length < 10) {
            logStep('evaluation', 'warning',
                `Limited results found (${allResults.length}). May not have enough data for quality blog topics.`
            );
        } else {
            logStep('evaluation', 'complete',
                `Search complete with ${allResults.length} relevant sources`
            );
        }

        return {
            results: allResults,
            log,
            searchPlan,
            timeWindow: {
                startDate,
                endDate,
                days: 90
            }
        };

    } catch (error) {
        logStep('error', 'failed', `Blog content search failed: ${error.message}`);
        throw error;
    }
}

/**
 * Generate 5 blog topic suggestions based on search results
 * Returns topics with title, synopsis, and relevance reasoning
 */
async function generateBlogTopics(userQuery, searchResults, statusCallback = null) {
    const log = [];
    const logStep = (step, status, message, data = {}) => {
        const entry = {
            step,
            timestamp: new Date(),
            status,
            message,
            ...data
        };
        log.push(entry);
        if (statusCallback) {
            statusCallback(entry);
        }
        console.log(`[Blog Planner] ${step}: ${message}`);
    };

    try {
        logStep('planning', 'start', 'Analyzing search results to generate blog topics...');

        // Prepare context from search results (sanitize ALL fields to remove invalid Unicode)
        const contextSources = searchResults.slice(0, 100).map((result, idx) => {
            const sanitizedContent = sanitizeUnicode(result.content || '').substring(0, 500);
            const sanitizedPlatform = sanitizeUnicode(result.platform || 'Unknown');
            const sanitizedDeeplink = sanitizeUnicode(result.deeplink || '');
            let dateStr = 'Unknown';
            try {
                dateStr = new Date(result.timestamp).toISOString().split('T')[0];
            } catch (e) {
                dateStr = 'Unknown';
            }
            return `[${idx + 1}] Platform: ${sanitizedPlatform}
Content: ${sanitizedContent}
URL: ${sanitizedDeeplink}
Date: ${dateStr}
---`;
        }).join('\n\n');

        const instructionsData = await getInstructions();
        const sanitizedQuery = sanitizeUnicode(userQuery);
        const sanitizedInstructions = sanitizeUnicode(instructionsData.topicGeneration);

        const prompt = `${sanitizedInstructions}

User Request: "${sanitizedQuery}"

Here are ${searchResults.length} community posts and discussions from the last 90 days:

${contextSources}

Task: Based on this community data, suggest exactly 5 blog post topics that would be valuable and relevant.

For each topic, provide:
1. A compelling blog post title (engaging, specific, actionable)
2. A brief synopsis (2-3 sentences describing what the blog post would cover)
3. Why it's relevant (1-2 sentences explaining why this topic matters based on the community data)

Return your response as valid JSON only (no markdown, no code blocks):
{
  "topics": [
    {
      "title": "Blog post title here",
      "synopsis": "2-3 sentence synopsis of what this post would cover and how it would help readers.",
      "relevanceReason": "1-2 sentences explaining why this topic is important based on the community feedback."
    }
  ],
  "reasoning": "Overall 1-2 sentence explanation of your topic selection strategy"
}`;

        logStep('planning', 'processing', 'Generating topics with Claude Sonnet 4.5...', {
            model: 'claude-sonnet-4-5-20250929',
            sourcesAnalyzed: searchResults.length
        });

        const anthropic = getClaudeClient();
        // Sanitize the FINAL prompt right before sending to ensure no invalid Unicode
        const sanitizedPrompt = sanitizeUnicode(prompt);
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: sanitizedPrompt
            }]
        });

        const responseText = message.content[0].text;

        logStep('planning', 'parsing', 'Parsing topic suggestions...', {
            tokens: message.usage.input_tokens + message.usage.output_tokens
        });

        // Parse JSON response
        let result;
        try {
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            result = JSON.parse(cleanedResponse);
        } catch (parseError) {
            logStep('planning', 'error', 'Failed to parse Claude response', { error: parseError.message });
            throw new Error('Invalid JSON response from Claude');
        }

        // Validate we have exactly 5 topics
        if (!result.topics || !Array.isArray(result.topics)) {
            throw new Error('Invalid topic format from Claude');
        }

        // Ensure exactly 5 topics
        const topics = result.topics.slice(0, 5);
        if (topics.length < 5) {
            logStep('planning', 'warning', `Only ${topics.length} topics generated, expected 5`);
        }

        logStep('planning', 'complete', `Successfully generated ${topics.length} blog topic suggestions`, {
            tokens: message.usage.input_tokens + message.usage.output_tokens
        });

        return {
            topics,
            reasoning: result.reasoning || 'Topics selected based on community feedback analysis.',
            log,
            usage: message.usage
        };

    } catch (error) {
        logStep('error', 'failed', `Topic generation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Generate a complete blog post for a given topic
 * Includes cover image generation, title, subtitle, and body content
 */
async function generateBlogPost(topic, synopsis, relevanceReason, searchResults, statusCallback = null) {
    const log = [];
    const logStep = (step, status, message, data = {}) => {
        const entry = {
            step,
            timestamp: new Date(),
            status,
            message,
            ...data
        };
        log.push(entry);
        if (statusCallback) {
            statusCallback(entry);
        }
        console.log(`[Blog Author] ${step}: ${message}`);
    };

    try {
        // Step 1: Generate cover images
        logStep('cover_image', 'start', 'Selecting icons for blog cover image...');

        const anthropic = getClaudeClient();
        const iconSelection = await selectIconsForTopic(topic, anthropic);

        logStep('cover_image', 'icons_selected',
            `Selected icons: ${iconSelection.iconNames.join(', ')}`,
            {
                icons: iconSelection.iconNames,
                reasoning: iconSelection.reasoning,
                usedAI: iconSelection.usedAI
            }
        );

        logStep('cover_image', 'generating', 'Generating 5 cover image variations...');

        const coverImages = await generateVariations(topic, 5, iconSelection.iconPaths);

        logStep('cover_image', 'complete', `Generated ${coverImages.length} cover images`, {
            images: coverImages
        });

        // Step 2: Generate blog content
        logStep('content', 'start', 'Writing blog post content with Claude Sonnet 4.5...');

        // Prepare relevant sources for context (sanitize ALL fields to remove invalid Unicode)
        const contextSources = searchResults.slice(0, 50).map((result, idx) => {
            const sanitizedContent = sanitizeUnicode(result.content || '');
            const sanitizedPlatform = sanitizeUnicode(result.platform || 'Unknown');
            const sanitizedDeeplink = sanitizeUnicode(result.deeplink || '');
            let dateStr = 'Unknown';
            try {
                dateStr = new Date(result.timestamp).toISOString().split('T')[0];
            } catch (e) {
                dateStr = 'Unknown';
            }
            return `[Source ${idx + 1}]
Platform: ${sanitizedPlatform}
Content: ${sanitizedContent}
URL: ${sanitizedDeeplink}
Date: ${dateStr}
---`;
        }).join('\n\n');

        const instructionsData = await getInstructions();
        const sanitizedPostInstructions = sanitizeUnicode(instructionsData.postGeneration || '');
        const sanitizedTopic = sanitizeUnicode(topic || '');
        const sanitizedSynopsis = sanitizeUnicode(synopsis || '');
        const sanitizedRelevance = sanitizeUnicode(relevanceReason || '');

        const prompt = `${sanitizedPostInstructions}

Topic: ${sanitizedTopic}
Synopsis: ${sanitizedSynopsis}
Why This Matters: ${sanitizedRelevance}

Here are real community discussions and feedback to inform your writing:

${contextSources}

Task: Write a complete, high-quality blog post.

Return your response as valid JSON only (no markdown, no code blocks):
{
  "title": "Final polished blog post title",
  "subtitle": "A compelling subtitle or tagline (1 sentence)",
  "body": "Full HTML-formatted blog post content",
  "metaDescription": "SEO meta description (150-160 characters)",
  "slug": "url-friendly-slug"
}`;

        // Use the same anthropic client instance from icon selection
        // Sanitize the FINAL prompt right before sending to ensure no invalid Unicode
        const sanitizedPrompt = sanitizeUnicode(prompt);
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 16000,
            messages: [{
                role: 'user',
                content: sanitizedPrompt
            }]
        });

        const responseText = message.content[0].text;

        logStep('content', 'parsing', 'Parsing blog post content...', {
            tokens: message.usage.input_tokens + message.usage.output_tokens,
            model: 'claude-sonnet-4-5-20250929'
        });

        // Parse JSON response
        let blogContent;
        try {
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            blogContent = JSON.parse(cleanedResponse);
        } catch (parseError) {
            logStep('content', 'error', 'Failed to parse blog content', { error: parseError.message });
            throw new Error('Invalid JSON response from Claude');
        }

        // Validate required fields
        if (!blogContent.title || !blogContent.body) {
            throw new Error('Missing required blog content fields');
        }

        logStep('content', 'complete', 'Blog post generated successfully', {
            tokens: message.usage.input_tokens + message.usage.output_tokens,
            wordCount: blogContent.body.split(/\s+/).length
        });

        return {
            ...blogContent,
            coverImages,
            selectedIcons: iconSelection.iconNames,
            iconReasoning: iconSelection.reasoning,
            log,
            usage: message.usage
        };

    } catch (error) {
        logStep('error', 'failed', `Blog post generation failed: ${error.message}`);
        throw error;
    }
}

module.exports = {
    searchForBlogContent,
    generateBlogTopics,
    generateBlogPost
};
