const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// User management
router.get('/users', auth, adminAuth, adminController.getUsers);
router.put('/users/:id/role', auth, adminAuth, adminController.updateUserRole);

// Agent configuration
router.get('/agent-config/:type', auth, adminAuth, adminController.getAgentConfig);
router.put('/agent-config/:type', auth, adminAuth, adminController.updateAgentConfig);
router.get('/agent-config/:type/versions', auth, adminAuth, adminController.getVersionHistory);
router.get('/agent-config/:type/version/:versionNumber', auth, adminAuth, adminController.getSpecificVersion);
router.post('/agent-config/:type/restore/:versionNumber', auth, adminAuth, adminController.restoreVersion);
router.get('/agent-config/:type/diff/:v1/:v2', auth, adminAuth, adminController.compareVersions);

// Background agent
router.post('/agent/run', auth, adminAuth, adminController.runBackgroundAgent);

module.exports = router;
