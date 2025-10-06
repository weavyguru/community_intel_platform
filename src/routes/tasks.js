const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.post('/', auth, taskController.createTask);
router.get('/', auth, taskController.getTasks);
router.get('/count', auth, taskController.getTaskCount);
router.get('/stats', auth, taskController.getTaskStats);
router.get('/:id', auth, taskController.getTask);
router.put('/:id', auth, taskController.updateTask);
router.put('/:id/complete', auth, taskController.completeTask);
router.put('/:id/reopen', auth, taskController.reopenTask);
router.put('/:id/skip', auth, taskController.skipTask);
router.put('/:id/unskip', auth, taskController.unskipTask);
router.put('/:id/delegate', auth, taskController.delegateTask);
router.patch('/:id/response', auth, taskController.updateSuggestedResponse);
router.delete('/:id', auth, adminAuth, taskController.deleteTask);
router.put('/:id/priority', auth, adminAuth, taskController.updatePriority);

module.exports = router;
