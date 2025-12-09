/**
 * Blog Publishing Service Factory
 * Routes to appropriate publisher based on BLOG_PUBLISHER env var
 */

const axios = require('axios');

// Get the configured publisher type
const getPublisherType = () => {
    return process.env.BLOG_PUBLISHER || 'hubspot';
};

/**
 * Check if blog publishing is configured
 */
const isConfigured = () => {
    const publisherType = getPublisherType();

    if (publisherType === 'hubspot') {
        const HubSpotService = require('./hubspotService');
        const hubspot = new HubSpotService();
        return hubspot.isConfigured();
    }

    if (publisherType === 'custom') {
        return !!(process.env.BLOG_API_ENDPOINT && process.env.BLOG_API_KEY);
    }

    return false;
};

/**
 * Publish a blog post
 * @param {Object} post - The blog post data
 * @param {string} post.title - Post title
 * @param {string} post.content - HTML content
 * @param {string} post.slug - URL slug
 * @param {string} post.metaDescription - Meta description
 * @param {string} post.coverImagePath - Local path to cover image
 * @returns {Promise<Object>} Result with postId and editorUrl
 */
const publishPost = async (post) => {
    const publisherType = getPublisherType();

    if (publisherType === 'hubspot') {
        return publishToHubSpot(post);
    }

    if (publisherType === 'custom') {
        return publishToCustomApi(post);
    }

    throw new Error(`Unknown blog publisher type: ${publisherType}`);
};

/**
 * Publish to HubSpot
 */
const publishToHubSpot = async (post) => {
    const HubSpotService = require('./hubspotService');
    const hubspot = new HubSpotService();

    if (!hubspot.isConfigured()) {
        throw new Error('HubSpot is not configured');
    }

    // Upload cover image first
    let coverImageUrl = null;
    if (post.coverImagePath) {
        const imageResult = await hubspot.uploadImage(post.coverImagePath);
        coverImageUrl = imageResult.url;
    }

    // Create the blog post
    const result = await hubspot.createBlogPost({
        title: post.title,
        body: post.content,
        slug: post.slug,
        metaDescription: post.metaDescription,
        featuredImageUrl: coverImageUrl
    });

    return {
        postId: result.id,
        editorUrl: result.editorUrl,
        publisherType: 'hubspot'
    };
};

/**
 * Publish to custom API
 * Sends POST request to BLOG_API_ENDPOINT with Bearer token auth
 */
const publishToCustomApi = async (post) => {
    const endpoint = process.env.BLOG_API_ENDPOINT;
    const apiKey = process.env.BLOG_API_KEY;

    if (!endpoint || !apiKey) {
        throw new Error('Custom blog API not configured. Set BLOG_API_ENDPOINT and BLOG_API_KEY.');
    }

    try {
        const response = await axios.post(endpoint, {
            title: post.title,
            content: post.content,
            slug: post.slug,
            metaDescription: post.metaDescription,
            coverImagePath: post.coverImagePath
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return {
            postId: response.data.id || response.data.postId,
            editorUrl: response.data.editorUrl || response.data.url || null,
            publisherType: 'custom',
            response: response.data
        };
    } catch (error) {
        console.error('Custom API publish error:', error.message);
        if (error.response?.data) {
            console.error('API response:', error.response.data);
        }
        throw new Error(`Custom API publish failed: ${error.message}`);
    }
};

module.exports = {
    getPublisherType,
    isConfigured,
    publishPost
};
