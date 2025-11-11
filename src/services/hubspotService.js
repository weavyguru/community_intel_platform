const axios = require('axios');
const fs = require('fs').promises;
const FormData = require('form-data');
const path = require('path');

class HubSpotService {
    constructor() {
        this.apiKey = process.env.HUBSPOT_API_KEY;
        this.blogId = process.env.HUBSPOT_BLOG_ID;
        this.contentHubId = process.env.HUBSPOT_CONTENT_HUB_ID;

        if (!this.apiKey) {
            console.warn('HUBSPOT_API_KEY not configured. HubSpot publishing will not be available.');
            this.api = null;
            return;
        }

        if (!this.blogId) {
            console.warn('HUBSPOT_BLOG_ID not configured. HubSpot publishing will not be available.');
            this.api = null;
            return;
        }

        // Create axios instance with default config
        this.api = axios.create({
            baseURL: 'https://api.hubapi.com',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Check if HubSpot is configured and available
     */
    isConfigured() {
        return this.api !== null;
    }

    /**
     * Upload an image file to HubSpot file manager
     * @param {string} filePath - Local path to the image file
     * @param {string} folderPath - Optional folder path in HubSpot (e.g., "/blog-images")
     * @returns {Promise<Object>} Uploaded file object with URL
     */
    async uploadImage(filePath, folderPath = '/blog-images') {
        if (!this.isConfigured()) {
            throw new Error('HubSpot is not configured.');
        }

        try {
            console.log(`Uploading image to HubSpot: ${filePath}...`);

            // Read the file
            const fileBuffer = await fs.readFile(filePath);
            const fileName = path.basename(filePath);

            // Create form data
            const formData = new FormData();
            formData.append('file', fileBuffer, fileName);
            formData.append('folderPath', folderPath);
            formData.append('options', JSON.stringify({
                access: 'PUBLIC_INDEXABLE',
                overwrite: false
            }));

            // Upload to HubSpot file manager
            const response = await axios.post(
                'https://api.hubapi.com/filemanager/api/v3/files/upload',
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        ...formData.getHeaders()
                    }
                }
            );

            const uploadedFile = response.data;
            console.log('Upload response:', JSON.stringify(uploadedFile, null, 2));

            // HubSpot returns the URL in different fields depending on the response
            const fileUrl = uploadedFile.url || uploadedFile.objects?.[0]?.url || null;
            console.log(`Image uploaded successfully! URL: ${fileUrl}`);

            return {
                id: uploadedFile.id || uploadedFile.objects?.[0]?.id,
                url: fileUrl,
                name: uploadedFile.name || uploadedFile.objects?.[0]?.name,
                fullResponse: uploadedFile
            };

        } catch (error) {
            console.error('Error uploading image to HubSpot:', error.message);
            if (error.response?.data) {
                console.error('   HubSpot API response:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`HubSpot image upload failed: ${error.message}`);
        }
    }

    /**
     * Publish a blog post to HubSpot in draft mode
     * @param {Object} blogPost - Blog post data
     * @param {string} blogPost.title - Blog post title
     * @param {string} blogPost.subtitle - Blog subtitle
     * @param {string} blogPost.body - HTML content of the blog post
     * @param {string} [blogPost.metaDescription] - Meta description for SEO
     * @param {string} [blogPost.slug] - URL slug
     * @param {string} [blogPost.coverImagePath] - Local path to cover image file
     * @returns {Promise<Object>} Created blog post object from HubSpot
     */
    async publishBlogPost(blogPost) {
        if (!this.isConfigured()) {
            throw new Error('HubSpot is not configured. Please set HUBSPOT_API_KEY and HUBSPOT_BLOG_ID in your environment variables.');
        }

        try {
            const {
                title,
                subtitle,
                body,
                metaDescription = '',
                slug = '',
                coverImagePath = null
            } = blogPost;

            // Validate required fields
            if (!title || !body) {
                throw new Error('Title and body are required fields.');
            }

            console.log(`Publishing blog post to HubSpot: "${title}"...`);

            // Upload cover image if provided
            let uploadedImageUrl = null;
            if (coverImagePath) {
                console.log('Uploading cover image to HubSpot...');
                const uploadResult = await this.uploadImage(coverImagePath);
                uploadedImageUrl = uploadResult.url;
                console.log(`Cover image uploaded: ${uploadedImageUrl}`);
            }

            // Prepare blog post object for HubSpot API
            const hubspotBlogPost = {
                name: title,
                postBody: body,
                slug: slug || this.generateSlug(title),
                metaDescription: metaDescription || subtitle || '',
                contentGroupId: this.blogId,
                state: 'DRAFT', // Always publish as draft
                htmlTitle: title,
                postSummary: subtitle || '',
                // Set publish date to current date/time (in milliseconds since epoch)
                publishDate: Date.now()
            };

            // Add featured image if we have one
            if (uploadedImageUrl) {
                hubspotBlogPost.featuredImage = uploadedImageUrl;
                hubspotBlogPost.featuredImageAltText = title;
            }

            // Add content hub ID if configured
            if (this.contentHubId) {
                hubspotBlogPost.contentHubId = this.contentHubId;
            }

            console.log('Creating blog post in HubSpot...');
            console.log('Request payload:', JSON.stringify(hubspotBlogPost, null, 2));

            // Create the blog post
            const response = await this.api.post('/cms/v3/blogs/posts', hubspotBlogPost);
            const createdPost = response.data;

            console.log(`Blog post created with ID: ${createdPost.id}`);

            // Now update the post to add custom template fields
            if (subtitle || uploadedImageUrl) {
                console.log('Updating post with custom template fields...');

                const updatePayload = {
                    widgets: {}
                };

                // Add custom fields as widgets
                if (subtitle) {
                    updatePayload.widgets.blog_preamble = {
                        type: 'text',
                        body: {
                            value: subtitle
                        }
                    };
                }

                if (uploadedImageUrl) {
                    updatePayload.widgets.blog_header_image = {
                        type: 'image',
                        body: {
                            src: uploadedImageUrl,
                            alt: title
                        }
                    };

                    updatePayload.widgets.blog_header_image_alt = {
                        type: 'text',
                        body: {
                            value: title
                        }
                    };
                }

                console.log('Update payload:', JSON.stringify(updatePayload, null, 2));

                try {
                    const updateResponse = await this.api.patch(`/cms/v3/blogs/posts/${createdPost.id}`, updatePayload);
                    console.log('Custom fields updated successfully');
                } catch (updateError) {
                    console.error('Error updating custom fields (non-fatal):', updateError.message);
                    if (updateError.response?.data) {
                        console.error('Update error response:', JSON.stringify(updateError.response.data, null, 2));
                    }
                }
            }

            console.log(`Blog post published to HubSpot successfully!`);
            console.log(`   - ID: ${createdPost.id}`);
            console.log(`   - Status: ${createdPost.state}`);
            console.log(`   - URL: ${createdPost.url || 'N/A'}`);

            // Construct HubSpot editor URL
            const editorUrl = `https://app.hubspot.com/blog/462967/editor/${createdPost.id}/content`;

            return {
                id: createdPost.id,
                url: editorUrl,
                state: createdPost.state,
                publishedAt: createdPost.publishDate ? new Date(createdPost.publishDate) : null,
                imageUrl: uploadedImageUrl,
                fullResponse: createdPost
            };

        } catch (error) {
            console.error('Error publishing to HubSpot:', error.message);
            if (error.response?.data) {
                console.error('   HubSpot API response:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`HubSpot publishing failed: ${error.message}`);
        }
    }

    /**
     * Update an existing blog post in HubSpot
     * @param {string} hubspotPostId - The HubSpot blog post ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated blog post object
     */
    async updateBlogPost(hubspotPostId, updates) {
        if (!this.isConfigured()) {
            throw new Error('HubSpot is not configured.');
        }

        try {
            console.log(`Updating HubSpot blog post ${hubspotPostId}...`);

            const response = await this.api.patch(`/cms/v3/blogs/posts/${hubspotPostId}`, updates);
            const updatedPost = response.data;

            console.log(`Blog post updated successfully!`);

            // Construct HubSpot editor URL
            const editorUrl = `https://app.hubspot.com/blog/462967/editor/${updatedPost.id}/content`;

            return {
                id: updatedPost.id,
                url: editorUrl,
                state: updatedPost.state,
                fullResponse: updatedPost
            };

        } catch (error) {
            console.error('Error updating HubSpot post:', error.message);
            if (error.response?.data) {
                console.error('   HubSpot API response:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`HubSpot update failed: ${error.message}`);
        }
    }

    /**
     * Delete a blog post from HubSpot
     * @param {string} hubspotPostId - The HubSpot blog post ID
     * @returns {Promise<void>}
     */
    async deleteBlogPost(hubspotPostId) {
        if (!this.isConfigured()) {
            throw new Error('HubSpot is not configured.');
        }

        try {
            console.log(`Deleting HubSpot blog post ${hubspotPostId}...`);

            await this.api.delete(`/cms/v3/blogs/posts/${hubspotPostId}`);

            console.log(`Blog post deleted successfully!`);

        } catch (error) {
            console.error('Error deleting HubSpot post:', error.message);
            if (error.response?.data) {
                console.error('   HubSpot API response:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`HubSpot deletion failed: ${error.message}`);
        }
    }

    /**
     * Generate a URL-friendly slug from title
     * @param {string} title - Blog post title
     * @returns {string} URL slug
     */
    generateSlug(title) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
    }
}

module.exports = new HubSpotService();
