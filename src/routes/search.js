const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const taskGenerationController = require('../controllers/taskGenerationController');
const auth = require('../middleware/auth');

// Temporarily remove auth for testing
router.post('/search', searchController.search);
router.post('/ask', searchController.ask);
router.get('/search/filters', searchController.getFilters);

// Conversation history routes
router.get('/conversations/recent', auth, searchController.getRecentConversations);
router.get('/conversations/search', auth, searchController.searchConversations);
router.get('/conversations/:id', auth, searchController.getConversation);

// Task generation routes
router.post('/conversations/:id/generate-tasks', auth, taskGenerationController.generateTasks);
router.post('/conversations/:id/tasks/:taskIndex/create', auth, taskGenerationController.createTaskFromSuggestion);
router.patch('/conversations/:id/tasks/:taskIndex', auth, taskGenerationController.updateSuggestedTask);
router.delete('/conversations/:id/tasks/:taskIndex', auth, taskGenerationController.rejectSuggestedTask);

module.exports = router;
