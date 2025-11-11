const blogService = require('../services/blogService');
const hubspotService = require('../services/hubspotService');
const BlogTopic = require('../models/BlogTopic');
const BlogPost = require('../models/BlogPost');

/**
 * Start the blog creation process
 * Step 1: Search for content and generate topic suggestions
 */
exports.searchAndPlanTopics = async (req, res) => {
    try {
        const { query, platforms } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const userId = req.session.user ? req.session.user._id : null;

        console.log(`[Blog Creation] User query: "${query}"`);

        // Create a blog topic document to track progress
        const blogTopicDoc = new BlogTopic({
            userQuery: query,
            topics: [],
            searchResults: [],
            searchLog: [],
            status: 'searching',
            createdBy: userId
        });

        await blogTopicDoc.save();

        // Emit status updates via Socket.IO
        const emitStatus = (entry) => {
            if (req.app.get('io')) {
                req.app.get('io').emit('blog:status', {
                    topicId: blogTopicDoc._id,
                    ...entry
                });
            }
        };

        // Step 1: Search for content
        const searchData = await blogService.searchForBlogContent(query, platforms, emitStatus);

        blogTopicDoc.searchResults = searchData.results.map(r => ({
            platform: r.platform,
            url: r.deeplink,
            content: r.content,
            timestamp: new Date(r.timestamp),
            relevance_score: r.relevance_score
        }));
        blogTopicDoc.searchLog = searchData.log;
        blogTopicDoc.searchTimeWindow = searchData.timeWindow;
        blogTopicDoc.status = 'planning';
        await blogTopicDoc.save();

        // Step 2: Generate topic suggestions
        const topicsData = await blogService.generateBlogTopics(
            query,
            searchData.results,
            emitStatus
        );

        blogTopicDoc.topics = topicsData.topics.map(t => ({
            title: t.title,
            synopsis: t.synopsis,
            relevanceReason: t.relevanceReason,
            selected: false
        }));
        blogTopicDoc.status = 'ready';
        blogTopicDoc.searchLog.push(...topicsData.log);
        await blogTopicDoc.save();

        console.log(`[Blog Creation] Generated ${topicsData.topics.length} topic suggestions`);

        return res.json({
            success: true,
            topicId: blogTopicDoc._id,
            topics: topicsData.topics,
            reasoning: topicsData.reasoning,
            resultsCount: searchData.results.length,
            timeWindow: searchData.timeWindow
        });

    } catch (error) {
        console.error('Error in searchAndPlanTopics:', error);
        return res.status(500).json({
            error: 'Failed to generate blog topics',
            message: error.message
        });
    }
};

/**
 * Generate blog posts for selected topics
 * Step 2: User selects topics, we generate full blog posts
 */
exports.generateBlogPosts = async (req, res) => {
    try {
        const { topicId, selectedTopicIndices } = req.body;

        if (!topicId || !selectedTopicIndices || selectedTopicIndices.length === 0) {
            return res.status(400).json({
                error: 'Topic ID and selected topics are required'
            });
        }

        const userId = req.session.user ? req.session.user._id : null;

        // Get the blog topic document
        const blogTopicDoc = await BlogTopic.findById(topicId);
        if (!blogTopicDoc) {
            return res.status(404).json({ error: 'Topic document not found' });
        }

        // Emit status updates via Socket.IO
        const emitStatus = (entry) => {
            if (req.app.get('io')) {
                req.app.get('io').emit('blog:generation', {
                    topicId,
                    ...entry
                });
            }
        };

        const generatedPosts = [];

        // Generate blog post for each selected topic
        for (const topicIndex of selectedTopicIndices) {
            if (topicIndex < 0 || topicIndex >= blogTopicDoc.topics.length) {
                console.warn(`Invalid topic index: ${topicIndex}`);
                continue;
            }

            const selectedTopic = blogTopicDoc.topics[topicIndex];

            emitStatus({
                step: 'generating',
                status: 'start',
                message: `Generating blog post: "${selectedTopic.title}"...`
            });

            try {
                // Generate the blog post
                const blogPostData = await blogService.generateBlogPost(
                    selectedTopic.title,
                    selectedTopic.synopsis,
                    selectedTopic.relevanceReason,
                    blogTopicDoc.searchResults,
                    emitStatus
                );

                // Create a BlogPost document
                const blogPost = new BlogPost({
                    title: blogPostData.title,
                    subtitle: blogPostData.subtitle,
                    body: blogPostData.body,
                    metaDescription: blogPostData.metaDescription,
                    slug: blogPostData.slug,
                    topic: selectedTopic.title,
                    synopsis: selectedTopic.synopsis,
                    relevanceReason: selectedTopic.relevanceReason,
                    coverImages: blogPostData.coverImages.map(img => ({
                        url: img.url,
                        filename: img.filename,
                        isSelected: false
                    })),
                    selectedCoverImage: {
                        url: blogPostData.coverImages[0].url,
                        filename: blogPostData.coverImages[0].filename
                    },
                    selectedIcons: blogPostData.selectedIcons.map(name => ({
                        name,
                        reasoning: blogPostData.iconReasoning
                    })),
                    sources: blogTopicDoc.searchResults,
                    generationLog: blogPostData.log,
                    status: 'ready',
                    createdBy: userId
                });

                // Mark first image as selected by default
                if (blogPost.coverImages.length > 0) {
                    blogPost.coverImages[0].isSelected = true;
                }

                await blogPost.save();

                // Update blog topic to link to generated post
                blogTopicDoc.topics[topicIndex].selected = true;
                blogTopicDoc.topics[topicIndex].blogPostId = blogPost._id;

                generatedPosts.push({
                    id: blogPost._id,
                    title: blogPost.title,
                    subtitle: blogPost.subtitle,
                    coverImages: blogPost.coverImages,
                    status: blogPost.status
                });

                emitStatus({
                    step: 'generating',
                    status: 'complete',
                    message: `Blog post generated: "${selectedTopic.title}"`
                });

            } catch (error) {
                console.error(`Error generating blog post for topic ${topicIndex}:`, error);
                emitStatus({
                    step: 'generating',
                    status: 'error',
                    message: `Failed to generate: "${selectedTopic.title}" - ${error.message}`
                });
            }
        }

        blogTopicDoc.status = 'completed';
        await blogTopicDoc.save();

        return res.json({
            success: true,
            posts: generatedPosts
        });

    } catch (error) {
        console.error('Error in generateBlogPosts:', error);
        return res.status(500).json({
            error: 'Failed to generate blog posts',
            message: error.message
        });
    }
};

/**
 * Get a single blog post by ID
 */
exports.getBlogPost = async (req, res) => {
    try {
        const { id } = req.params;

        const blogPost = await BlogPost.findById(id);
        if (!blogPost) {
            return res.status(404).json({ error: 'Blog post not found' });
        }

        return res.json({
            success: true,
            post: blogPost
        });

    } catch (error) {
        console.error('Error in getBlogPost:', error);
        return res.status(500).json({
            error: 'Failed to get blog post',
            message: error.message
        });
    }
};

/**
 * Update a blog post (title, subtitle, body, selected cover image)
 */
exports.updateBlogPost = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subtitle, body, metaDescription, slug, selectedCoverImageIndex } = req.body;

        const blogPost = await BlogPost.findById(id);
        if (!blogPost) {
            return res.status(404).json({ error: 'Blog post not found' });
        }

        // Update fields if provided
        if (title) blogPost.title = title;
        if (subtitle) blogPost.subtitle = subtitle;
        if (body) blogPost.body = body;
        if (metaDescription) blogPost.metaDescription = metaDescription;
        if (slug) blogPost.slug = slug;

        // Update selected cover image
        if (typeof selectedCoverImageIndex === 'number') {
            if (selectedCoverImageIndex >= 0 && selectedCoverImageIndex < blogPost.coverImages.length) {
                // Unselect all images
                blogPost.coverImages.forEach(img => img.isSelected = false);
                // Select the chosen one
                blogPost.coverImages[selectedCoverImageIndex].isSelected = true;
                blogPost.selectedCoverImage = {
                    url: blogPost.coverImages[selectedCoverImageIndex].url,
                    filename: blogPost.coverImages[selectedCoverImageIndex].filename
                };
            }
        }

        await blogPost.save();

        return res.json({
            success: true,
            post: blogPost
        });

    } catch (error) {
        console.error('Error in updateBlogPost:', error);
        return res.status(500).json({
            error: 'Failed to update blog post',
            message: error.message
        });
    }
};

/**
 * Delete a blog post
 */
exports.deleteBlogPost = async (req, res) => {
    try {
        const { id } = req.params;

        const blogPost = await BlogPost.findByIdAndDelete(id);
        if (!blogPost) {
            return res.status(404).json({ error: 'Blog post not found' });
        }

        return res.json({
            success: true,
            message: 'Blog post deleted successfully'
        });

    } catch (error) {
        console.error('Error in deleteBlogPost:', error);
        return res.status(500).json({
            error: 'Failed to delete blog post',
            message: error.message
        });
    }
};

/**
 * Publish a blog post to HubSpot (in draft mode)
 */
exports.publishToHubSpot = async (req, res) => {
    try {
        const { id } = req.params;

        if (!hubspotService.isConfigured()) {
            return res.status(400).json({
                error: 'HubSpot is not configured. Please set HUBSPOT_API_KEY and HUBSPOT_BLOG_ID environment variables.'
            });
        }

        const blogPost = await BlogPost.findById(id);
        if (!blogPost) {
            return res.status(404).json({ error: 'Blog post not found' });
        }

        // Get the selected cover image local path
        let coverImagePath = null;
        if (blogPost.selectedCoverImage && blogPost.selectedCoverImage.filename) {
            // Convert the public URL to local file path
            const path = require('path');
            coverImagePath = path.join(__dirname, '../../public/uploads/blog-images', blogPost.selectedCoverImage.filename);
        }

        // Publish to HubSpot
        const hubspotResult = await hubspotService.publishBlogPost({
            title: blogPost.title,
            subtitle: blogPost.subtitle,
            body: blogPost.body,
            metaDescription: blogPost.metaDescription,
            slug: blogPost.slug,
            coverImagePath: coverImagePath
        });

        // Update blog post with HubSpot info
        blogPost.publishedToHubSpot = true;
        blogPost.hubSpotPostId = hubspotResult.id;
        blogPost.hubSpotUrl = hubspotResult.url;
        blogPost.publishedAt = new Date();
        blogPost.status = 'published';
        await blogPost.save();

        return res.json({
            success: true,
            hubspot: hubspotResult,
            post: blogPost
        });

    } catch (error) {
        console.error('Error in publishToHubSpot:', error);
        return res.status(500).json({
            error: 'Failed to publish to HubSpot',
            message: error.message
        });
    }
};

/**
 * Get all blog posts (with filters)
 */
exports.getAllBlogPosts = async (req, res) => {
    try {
        const { status, published, limit = 50, skip = 0 } = req.query;

        const query = {};
        if (status) query.status = status;
        if (published === 'true') query.publishedToHubSpot = true;
        if (published === 'false') query.publishedToHubSpot = false;

        const blogPosts = await BlogPost.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .select('title subtitle status publishedToHubSpot publishedAt hubSpotUrl selectedCoverImage createdAt');

        const total = await BlogPost.countDocuments(query);

        return res.json({
            success: true,
            posts: blogPosts,
            total,
            limit: parseInt(limit),
            skip: parseInt(skip)
        });

    } catch (error) {
        console.error('Error in getAllBlogPosts:', error);
        return res.status(500).json({
            error: 'Failed to get blog posts',
            message: error.message
        });
    }
};

/**
 * Regenerate cover images for a blog post
 */
exports.regenerateCoverImages = async (req, res) => {
    try {
        const { id } = req.params;

        const blogPost = await BlogPost.findById(id);
        if (!blogPost) {
            return res.status(404).json({ error: 'Blog post not found' });
        }

        const { selectIconsForTopic } = require('../lib/blogImageCreator/iconSelector');
        const { generateVariations } = require('../lib/blogImageCreator/generator');
        const Anthropic = require('@anthropic-ai/sdk');

        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });

        // Select new icons
        const iconSelection = await selectIconsForTopic(blogPost.title, anthropic);

        // Generate new variations
        const coverImages = await generateVariations(blogPost.title, 5, iconSelection.iconPaths);

        // Update blog post
        blogPost.coverImages = coverImages.map(img => ({
            url: img.url,
            filename: img.filename,
            isSelected: false
        }));

        // Select first image by default
        if (blogPost.coverImages.length > 0) {
            blogPost.coverImages[0].isSelected = true;
            blogPost.selectedCoverImage = {
                url: blogPost.coverImages[0].url,
                filename: blogPost.coverImages[0].filename
            };
        }

        blogPost.selectedIcons = iconSelection.iconNames.map(name => ({
            name,
            reasoning: iconSelection.reasoning
        }));

        await blogPost.save();

        return res.json({
            success: true,
            coverImages: blogPost.coverImages,
            selectedIcons: iconSelection.iconNames,
            reasoning: iconSelection.reasoning
        });

    } catch (error) {
        console.error('Error in regenerateCoverImages:', error);
        return res.status(500).json({
            error: 'Failed to regenerate cover images',
            message: error.message
        });
    }
};
