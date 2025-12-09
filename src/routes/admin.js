const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// User management
router.get('/users', auth, adminAuth, adminController.getUsers);
router.put('/users/:id/role', auth, adminAuth, adminController.updateUserRole);
router.delete('/users/:id', auth, adminAuth, adminController.deleteUser);

// Agent configuration
router.get('/agent-config/:type', auth, adminAuth, adminController.getAgentConfig);
router.put('/agent-config/:type', auth, adminAuth, adminController.updateAgentConfig);
router.get('/agent-config/:type/versions', auth, adminAuth, adminController.getVersionHistory);
router.get('/agent-config/:type/version/:versionNumber', auth, adminAuth, adminController.getSpecificVersion);
router.post('/agent-config/:type/restore/:versionNumber', auth, adminAuth, adminController.restoreVersion);
router.get('/agent-config/:type/diff/:v1/:v2', auth, adminAuth, adminController.compareVersions);

// Intelligence job
router.post('/agent/run', auth, adminAuth, adminController.runBackgroundAgent);
router.get('/job/stats', auth, adminAuth, adminController.getJobStats);
router.get('/job/history', auth, adminAuth, adminController.getJobHistory);
router.put('/job/interval', auth, adminAuth, adminController.updateJobInterval);
router.put('/job/toggle', auth, adminAuth, adminController.toggleJobEnabled);

module.exports = router;
