const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const auth = require('../middleware/auth');

router.post('/search', auth, searchController.search);
router.post('/ask', auth, searchController.ask);
router.get('/search/filters', auth, searchController.getFilters);

// Conversation history routes
router.get('/conversations/recent', auth, searchController.getRecentConversations);
router.get('/conversations/search', auth, searchController.searchConversations);
router.get('/conversations/:id', auth, searchController.getConversation);

module.exports = router;
