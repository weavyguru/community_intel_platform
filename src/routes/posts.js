const express = require('express');
const router = express.Router();
const postsController = require('../controllers/postsController');
const SocialPlatform = require('../models/SocialPlatform');
const Persona = require('../models/Persona');
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// Page route
router.get('/posts', auth, async (req, res) => {
    try {
        // Fetch platforms, personas, and task count for the page
        const [platforms, personas, taskCount] = await Promise.all([
            SocialPlatform.find({ isActive: true }).sort({ name: 1 }).lean(),
            Persona.find({}).sort({ name: 1 }).lean(),
            Task.countDocuments({ isCompleted: false, isSkipped: { $ne: true } })
        ]);

        res.render('posts', {
            title: 'Post Creator',
            activePage: 'posts',
            platforms,
            personas,
            taskCount,
            user: req.user || null
        });
    } catch (error) {
        console.error('Error rendering posts page:', error);
        res.status(500).render('error', {
            message: 'Failed to load Post Creator',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// API routes
router.post('/api/posts/search', postsController.search);
router.post('/api/posts/generate', postsController.generate);
router.get('/api/posts', postsController.getAll);
router.get('/api/posts/generations', postsController.getGenerations);
router.get('/api/posts/:id', postsController.getOne);
router.post('/api/posts/:id/create-task', postsController.createTaskFromPost);
router.delete('/api/posts/:id', postsController.delete);
router.delete('/api/posts/generation/:generationId', postsController.deleteGeneration);

module.exports = router;
