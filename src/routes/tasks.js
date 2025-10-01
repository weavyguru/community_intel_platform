const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.get('/', auth, taskController.getTasks);
router.get('/count', auth, taskController.getTaskCount);
router.get('/:id', auth, taskController.getTask);
router.put('/:id/complete', auth, taskController.completeTask);
router.put('/:id/reopen', auth, taskController.reopenTask);
router.delete('/:id', auth, adminAuth, taskController.deleteTask);
router.put('/:id/priority', auth, adminAuth, taskController.updatePriority);

module.exports = router;
