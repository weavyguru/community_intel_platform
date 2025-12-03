const StandalonePost = require('../models/StandalonePost');
const SocialPlatform = require('../models/SocialPlatform');
const Persona = require('../models/Persona');
const Task = require('../models/Task');
const postService = require('../services/postService');
const { v4: uuidv4 } = require('uuid');

/**
 * @desc    Search community data for post content
 * @route   POST /api/posts/search
 */
exports.search = async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Query is required'
            });
        }

        const io = req.app.get('io');
        const statusCallback = (status) => {
            if (io) {
                io.emit('postSearchProgress', status);
            }
        };

        const searchResult = await postService.searchForPostContent(query, statusCallback);

        res.json({
            success: true,
            results: searchResult.results,
            resultCount: searchResult.results.length,
            timeWindow: searchResult.timeWindow
        });

    } catch (error) {
        console.error('Error searching for post content:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to search community data'
        });
    }
};

/**
 * @desc    Generate posts for multiple platform/persona combinations
 * @route   POST /api/posts/generate
 */
exports.generate = async (req, res) => {
    try {
        const { query, platformIds, personaIds, charLength, searchResults } = req.body;

        // Validation
        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Query is required'
            });
        }

        if (!platformIds || platformIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'At least one platform is required'
            });
        }

        const io = req.app.get('io');
        const emit = (event, data) => {
            if (io) io.emit(event, data);
        };

        // Generate unique ID for this generation batch
        const generationId = `gen_${uuidv4()}`;

        emit('postGenerationProgress', {
            step: 'init',
            status: 'start',
            message: 'Starting post generation...',
            generationId
        });

        // Fetch platforms
        const platforms = await SocialPlatform.find({ _id: { $in: platformIds } }).lean();
        if (platforms.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid platforms found'
            });
        }

        // Fetch personas (or use null for neutral)
        let personas = [];
        if (personaIds && personaIds.length > 0) {
            personas = await Persona.find({ _id: { $in: personaIds } }).lean();
        }
        // If no personas selected, add null for "Neutral" persona
        if (personas.length === 0) {
            personas = [null];
        }

        // Calculate total combinations
        const totalCombinations = platforms.length * personas.length;

        emit('postGenerationProgress', {
            step: 'planning',
            status: 'complete',
            message: `Generating ${totalCombinations} posts (${platforms.length} platforms × ${personas.length} personas)`,
            totalCombinations
        });

        // Search if results not provided
        let results = searchResults;
        if (!results || results.length === 0) {
            emit('postGenerationProgress', {
                step: 'search',
                status: 'start',
                message: 'Searching community data...'
            });

            const searchResult = await postService.searchForPostContent(query, (status) => {
                emit('postSearchProgress', status);
            });
            results = searchResult.results;

            emit('postGenerationProgress', {
                step: 'search',
                status: 'complete',
                message: `Found ${results.length} community insights`
            });
        }

        // Generate image
        emit('postGenerationProgress', {
            step: 'image',
            status: 'start',
            message: 'Generating AI image with DALL-E 3...'
        });

        const { imageUrl, imagePrompt } = await postService.generatePostImage(query, (status) => {
            emit('postImageProgress', status);
        });

        emit('postGenerationProgress', {
            step: 'image',
            status: 'complete',
            message: imageUrl ? 'Image generated successfully' : 'Image generation skipped'
        });

        // Generate posts for each platform × persona combination
        const generatedPosts = [];
        let completedCount = 0;

        for (const platform of platforms) {
            for (const persona of personas) {
                completedCount++;
                const personaName = persona?.name || 'Neutral';

                emit('postGenerationProgress', {
                    step: 'generating',
                    status: 'in_progress',
                    message: `Generating post ${completedCount}/${totalCombinations}: ${platform.name} + ${personaName}`,
                    current: completedCount,
                    total: totalCombinations,
                    platform: platform.name,
                    persona: personaName
                });

                try {
                    const content = await postService.generateStandalonePost(
                        query,
                        results,
                        platform,
                        persona,
                        charLength || '1200-1800'
                    );

                    // Save to database
                    const post = await StandalonePost.create({
                        generationId,
                        userQuery: query,
                        platformId: platform._id,
                        platformName: platform.name,
                        personaId: persona?._id || null,
                        personaName,
                        content,
                        charLengthSetting: charLength || '1200-1800',
                        imageUrl,
                        imagePrompt,
                        createdBy: req.user?._id || null
                    });

                    generatedPosts.push(post);

                } catch (postError) {
                    console.error(`Error generating post for ${platform.name} + ${personaName}:`, postError);
                    emit('postGenerationProgress', {
                        step: 'error',
                        status: 'failed',
                        message: `Failed to generate post for ${platform.name} + ${personaName}: ${postError.message}`
                    });
                }
            }
        }

        emit('postGenerationProgress', {
            step: 'complete',
            status: 'complete',
            message: `Generated ${generatedPosts.length} posts successfully`,
            generationId,
            postCount: generatedPosts.length
        });

        res.status(201).json({
            success: true,
            generationId,
            imageUrl,
            imagePrompt,
            posts: generatedPosts,
            totalGenerated: generatedPosts.length
        });

    } catch (error) {
        console.error('Error generating posts:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate posts'
        });
    }
};

/**
 * @desc    Get all standalone posts with optional filters
 * @route   GET /api/posts
 */
exports.getAll = async (req, res) => {
    try {
        const { platformId, personaId, generationId, limit = 100, skip = 0 } = req.query;

        const filter = {};
        if (platformId) filter.platformId = platformId;
        if (personaId) filter.personaId = personaId;
        if (generationId) filter.generationId = generationId;

        const posts = await StandalonePost.find(filter)
            .sort({ generatedAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .lean();

        const total = await StandalonePost.countDocuments(filter);

        res.json({
            success: true,
            posts,
            total,
            hasMore: total > parseInt(skip) + posts.length
        });

    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch posts'
        });
    }
};

/**
 * @desc    Get a single post by ID
 * @route   GET /api/posts/:id
 */
exports.getOne = async (req, res) => {
    try {
        const post = await StandalonePost.findById(req.params.id).lean();

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        res.json({
            success: true,
            post
        });

    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch post'
        });
    }
};

/**
 * @desc    Delete a single post
 * @route   DELETE /api/posts/:id
 */
exports.delete = async (req, res) => {
    try {
        const post = await StandalonePost.findById(req.params.id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        await StandalonePost.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Post deleted'
        });

    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete post'
        });
    }
};

/**
 * @desc    Delete all posts from a generation
 * @route   DELETE /api/posts/generation/:generationId
 */
exports.deleteGeneration = async (req, res) => {
    try {
        const { generationId } = req.params;

        const result = await StandalonePost.deleteMany({ generationId });

        res.json({
            success: true,
            message: `Deleted ${result.deletedCount} posts`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('Error deleting generation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete generation'
        });
    }
};

/**
 * @desc    Get posts grouped by generation
 * @route   GET /api/posts/generations
 */
exports.getGenerations = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const generations = await StandalonePost.aggregate([
            {
                $group: {
                    _id: '$generationId',
                    userQuery: { $first: '$userQuery' },
                    imageUrl: { $first: '$imageUrl' },
                    postCount: { $sum: 1 },
                    platforms: { $addToSet: '$platformName' },
                    personas: { $addToSet: '$personaName' },
                    generatedAt: { $max: '$generatedAt' }
                }
            },
            { $sort: { generatedAt: -1 } },
            { $limit: parseInt(limit) }
        ]);

        res.json({
            success: true,
            generations
        });

    } catch (error) {
        console.error('Error fetching generations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch generations'
        });
    }
};

/**
 * @desc    Create a task from a standalone post
 * @route   POST /api/posts/:id/create-task
 */
exports.createTaskFromPost = async (req, res) => {
    try {
        const post = await StandalonePost.findById(req.params.id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        // Get platform for URL
        const platform = await SocialPlatform.findById(post.platformId);
        const platformUrl = platform?.url || '';
        const platformName = post.platformName || 'Social Media';

        // Build task content
        const taskTitle = `${platformName} post (${post.personaName})`;
        const taskSnippet = platformUrl
            ? `${post.content}\n\n🔗 ${platformUrl}`
            : post.content;

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
                postId: post._id.toString(),
                imageUrl: post.imageUrl || null
            }
        });

        res.status(201).json({
            success: true,
            task
        });

    } catch (error) {
        console.error('Error creating task from post:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create task'
        });
    }
};
