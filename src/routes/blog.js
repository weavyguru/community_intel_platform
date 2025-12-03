const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const blogInstructionsController = require('../controllers/blogInstructionsController');
const personaController = require('../controllers/personaController');
const socialPlatformController = require('../controllers/socialPlatformController');
const socialPostController = require('../controllers/socialPostController');

// Blog creation workflow endpoints
router.post('/api/blog/search-and-plan', blogController.searchAndPlanTopics);
router.post('/api/blog/generate', blogController.generateBlogPosts);

// Blog CRUD endpoints
router.get('/api/blog/posts', blogController.getAllBlogPosts);
router.get('/api/blog/posts/:id', blogController.getBlogPost);
router.put('/api/blog/posts/:id', blogController.updateBlogPost);
router.delete('/api/blog/posts/:id', blogController.deleteBlogPost);

// Publishing endpoints
router.post('/api/blog/posts/:id/publish-hubspot', blogController.publishToHubSpot);
router.post('/api/blog/posts/:id/regenerate-images', blogController.regenerateCoverImages);

// Blog instructions endpoints
router.get('/api/blog/instructions', blogInstructionsController.getActiveInstructions);
router.get('/api/blog/instructions/versions', blogInstructionsController.getAllVersions);
router.post('/api/blog/instructions', blogInstructionsController.createVersion);
router.post('/api/blog/instructions/:id/activate', blogInstructionsController.activateVersion);

// Persona endpoints
router.get('/api/blog/personas', personaController.getAllPersonas);
router.get('/api/blog/personas/:id', personaController.getPersona);
router.post('/api/blog/personas', personaController.createPersona);
router.put('/api/blog/personas/:id', personaController.updatePersona);
router.delete('/api/blog/personas/:id', personaController.deletePersona);

// Social platform endpoints
router.get('/api/blog/social-platforms', socialPlatformController.getAll);
router.get('/api/blog/social-platforms/:id', socialPlatformController.getOne);
router.post('/api/blog/social-platforms', socialPlatformController.create);
router.put('/api/blog/social-platforms/:id', socialPlatformController.update);
router.delete('/api/blog/social-platforms/:id', socialPlatformController.delete);

// Social post endpoints
router.get('/api/blog/posts/:blogPostId/social-posts', socialPostController.getForBlog);
router.get('/api/blog/posts/:blogPostId/has-social-posts', socialPostController.hasSocialPosts);
router.post('/api/blog/posts/:blogPostId/generate-social', socialPostController.generate);
router.delete('/api/blog/social-posts/:id', socialPostController.delete);
router.post('/api/blog/social-posts/:id/create-task', socialPostController.createTaskFromPost);

module.exports = router;
