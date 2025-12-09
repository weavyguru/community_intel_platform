/**
 * Blog Publishing Service Factory
 * Routes to appropriate publisher based on BLOG_PUBLISHER env var
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Gainable Blog API configuration
const GAINABLE_API_ENDPOINT = 'https://www.gainable.dev';
const GAINABLE_API_KEY = 'gbl_sk_7f3d9a2b1c8e4f6d5a0b3c2e1f9d8a7b6c5e4f3d2a1b0c9e8f7d6a5b4c3d2e1f';

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
        // Gainable API is hardcoded, always configured
        return true;
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
 * Upload image to Gainable API
 * POST /api/upload-image with multipart/form-data
 */
const uploadImageToCustomApi = async (imagePath) => {
    const baseUrl = GAINABLE_API_ENDPOINT;
    const apiKey = GAINABLE_API_KEY;

    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const filename = path.basename(imagePath);

    // Create form data
    const formData = new FormData();
    formData.append('image', imageBuffer, {
        filename: filename,
        contentType: 'image/png'
    });

    try {
        const response = await axios.post(`${baseUrl}/api/upload-image`, formData, {
            headers: {
                'X-API-Key': apiKey,
                ...formData.getHeaders()
            }
        });

        if (response.data.success) {
            console.log('[Custom API] Image uploaded:', response.data.url);
            return response.data.url;
        } else {
            throw new Error('Image upload failed: ' + JSON.stringify(response.data));
        }
    } catch (error) {
        console.error('Custom API image upload error:', error.message);
        if (error.response?.data) {
            console.error('API response:', error.response.data);
        }
        throw new Error(`Custom API image upload failed: ${error.message}`);
    }
};

/**
 * Publish to Gainable API
 * 1. Upload image via /api/upload-image
 * 2. Publish post via /api/publish-post
 */
const publishToCustomApi = async (post) => {
    const baseUrl = GAINABLE_API_ENDPOINT;
    const apiKey = GAINABLE_API_KEY;

    try {
        // Step 1: Upload cover image if provided
        let imageUrl = null;
        if (post.coverImagePath && fs.existsSync(post.coverImagePath)) {
            imageUrl = await uploadImageToCustomApi(post.coverImagePath);
        }

        // Step 2: Publish the blog post
        const response = await axios.post(`${baseUrl}/api/publish-post`, {
            title: post.title,
            subtitle: post.metaDescription || '',
            image: imageUrl,
            author: post.author || 'Gainable Team',
            body: post.content
        }, {
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.success) {
            console.log('[Custom API] Post published:', response.data.url);
            return {
                postId: response.data.slug,
                editorUrl: `${baseUrl}${response.data.url}`,
                publisherType: 'custom',
                response: response.data
            };
        } else {
            throw new Error('Publish failed: ' + JSON.stringify(response.data));
        }
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
