const SocialPost = require('../models/SocialPost');
const SocialPlatform = require('../models/SocialPlatform');
const BlogPost = require('../models/BlogPost');
const Persona = require('../models/Persona');
const Task = require('../models/Task');
const blogService = require('../services/blogService');

// @desc    Get all social posts for a blog post
// @route   GET /api/blog/posts/:blogPostId/social-posts
exports.getForBlog = async (req, res) => {
    try {
        const posts = await SocialPost.find({ blogPostId: req.params.blogPostId })
            .sort({ generatedAt: -1 })
            .lean();

        res.json({
            success: true,
            posts
        });
    } catch (error) {
        console.error('Error fetching social posts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch social posts'
        });
    }
};

// @desc    Generate social posts for a blog post
// @route   POST /api/blog/posts/:blogPostId/generate-social
exports.generate = async (req, res) => {
    try {
        const { platformId, personaId, charLength } = req.body;
        const { blogPostId } = req.params;

        // Validate blog post exists
        const blogPost = await BlogPost.findById(blogPostId);
        if (!blogPost) {
            return res.status(404).json({
                success: false,
                error: 'Blog post not found'
            });
        }

        // Validate platform exists
        const platform = await SocialPlatform.findById(platformId);
        if (!platform) {
            return res.status(404).json({
                success: false,
                error: 'Platform not found'
            });
        }

        // Get persona if provided
        let persona = null;
        if (personaId) {
            persona = await Persona.findById(personaId);
        }

        // Generate social posts using blog service
        const generatedPosts = await blogService.generateSocialPosts(
            blogPost,
            platform,
            persona,
            charLength || '1200-1800'
        );

        // Save all generated posts to database
        const savedPosts = [];
        for (const content of generatedPosts) {
            const socialPost = await SocialPost.create({
                blogPostId: blogPost._id,
                platformId: platform._id,
                personaId: persona?._id || null,
                platformName: platform.name,
                personaName: persona?.name || 'Neutral',
                content,
                createdBy: req.user?._id || null
            });
            savedPosts.push(socialPost);
        }

        res.status(201).json({
            success: true,
            posts: savedPosts
        });
    } catch (error) {
        console.error('Error generating social posts:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate social posts'
        });
    }
};

// @desc    Delete a social post
// @route   DELETE /api/blog/social-posts/:id
exports.delete = async (req, res) => {
    try {
        const post = await SocialPost.findById(req.params.id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Social post not found'
            });
        }

        await SocialPost.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Social post deleted'
        });
    } catch (error) {
        console.error('Error deleting social post:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete social post'
        });
    }
};

// @desc    Check if blog post has any social posts
// @route   GET /api/blog/posts/:blogPostId/has-social-posts
exports.hasSocialPosts = async (req, res) => {
    try {
        const count = await SocialPost.countDocuments({ blogPostId: req.params.blogPostId });

        res.json({
            success: true,
            hasPosts: count > 0,
            count
        });
    } catch (error) {
        console.error('Error checking social posts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check social posts'
        });
    }
};

// @desc    Create a task from a social post
// @route   POST /api/blog/social-posts/:id/create-task
exports.createTaskFromPost = async (req, res) => {
    try {
        const post = await SocialPost.findById(req.params.id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Social post not found'
            });
        }

        // Get platform for URL
        const platform = await SocialPlatform.findById(post.platformId);
        const platformUrl = platform?.url || '';
        const platformName = post.platformName || 'Social Media';

        // Build task content
        const taskTitle = `${platformName} post (${post.personaName})`;
        const taskSnippet = post.content;

        // Create task with HIGH priority (no delegation - that happens in task view)
        const task = await Task.create({
            title: taskTitle,
            snippet: taskSnippet,
            sourceUrl: platformUrl || '#',
            platform: 'LinkedIn', // Default platform enum
            taskType: 'post',
            priority: 'high',
            metadata: {
                originalPlatform: platformName,
                personaName: post.personaName,
                socialPostId: post._id.toString(),
                blogPostId: post.blogPostId?.toString() || null
            }
        });

        res.status(201).json({
            success: true,
            task
        });

    } catch (error) {
        console.error('Error creating task from social post:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create task'
        });
    }
};
