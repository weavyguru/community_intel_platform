const User = require('../models/User');
const { AgentConfig, AgentConfigVersion } = require('../models/AgentConfig');
const backgroundAgent = require('../services/backgroundAgent');

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Error retrieving users' });
  }
};

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  Private/Admin
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent changing own role
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    user.role = role;
    await user.save();

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Error updating user role' });
  }
};

// @desc    Get agent configuration
// @route   GET /api/admin/agent-config/:type
// @access  Private/Admin
exports.getAgentConfig = async (req, res) => {
  try {
    const { type } = req.params;

    if (!['ask', 'background', 'create-tasks'].includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    let config = await AgentConfig.findOne({ type })
      .populate('updatedBy', 'name email');

    // Create default config if it doesn't exist
    if (!config) {
      config = await AgentConfig.create({
        type,
        instructions: `# ${type === 'create-tasks' ? 'Task Generation' : type.charAt(0).toUpperCase() + type.slice(1)} Agent Instructions\n\nAdd your instructions here...`,
        valuePropositions: type === 'create-tasks' ? '# Value Propositions\n\nAdd value propositions here...' : undefined,
        currentVersion: 1,
        updatedBy: req.user._id
      });

      await config.populate('updatedBy', 'name email');
    }

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Get agent config error:', error);
    res.status(500).json({ error: 'Error retrieving agent configuration' });
  }
};

// @desc    Update agent configuration (creates new version)
// @route   PUT /api/admin/agent-config/:type
// @access  Private/Admin
exports.updateAgentConfig = async (req, res) => {
  try {
    const { type } = req.params;
    const { instructions, valuePropositions, searchFunctions, notificationSettings, changeNotes } = req.body;

    if (!['ask', 'background', 'create-tasks'].includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    if (!instructions) {
      return res.status(400).json({ error: 'Instructions are required' });
    }

    let config = await AgentConfig.findOne({ type });

    if (!config) {
      return res.status(404).json({ error: 'Agent configuration not found' });
    }

    // Create new version
    const newVersion = config.currentVersion + 1;

    await AgentConfigVersion.create({
      configId: config._id,
      type,
      version: newVersion,
      instructions,
      valuePropositions: valuePropositions || config.valuePropositions,
      searchFunctions: searchFunctions || config.searchFunctions,
      notificationSettings: notificationSettings || config.notificationSettings,
      createdBy: req.user._id,
      changeNotes
    });

    // Update current config
    config.instructions = instructions;
    if (valuePropositions !== undefined) config.valuePropositions = valuePropositions;
    if (searchFunctions) config.searchFunctions = searchFunctions;
    if (notificationSettings) config.notificationSettings = notificationSettings;
    config.currentVersion = newVersion;
    config.lastUpdated = Date.now();
    config.updatedBy = req.user._id;
    await config.save();

    await config.populate('updatedBy', 'name email');

    res.json({
      success: true,
      config,
      version: newVersion
    });
  } catch (error) {
    console.error('Update agent config error:', error);
    res.status(500).json({ error: 'Error updating agent configuration' });
  }
};

// @desc    Get version history
// @route   GET /api/admin/agent-config/:type/versions
// @access  Private/Admin
exports.getVersionHistory = async (req, res) => {
  try {
    const { type } = req.params;
    const { limit = 20, skip = 0 } = req.query;

    if (!['ask', 'background', 'create-tasks'].includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const versions = await AgentConfigVersion.find({ type })
      .sort({ version: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('createdBy', 'name email');

    const total = await AgentConfigVersion.countDocuments({ type });

    res.json({
      success: true,
      count: versions.length,
      total,
      versions
    });
  } catch (error) {
    console.error('Get version history error:', error);
    res.status(500).json({ error: 'Error retrieving version history' });
  }
};

// @desc    Get specific version
// @route   GET /api/admin/agent-config/:type/version/:versionNumber
// @access  Private/Admin
exports.getSpecificVersion = async (req, res) => {
  try {
    const { type, versionNumber } = req.params;

    if (!['ask', 'background', 'create-tasks'].includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const version = await AgentConfigVersion.findOne({
      type,
      version: parseInt(versionNumber)
    }).populate('createdBy', 'name email');

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({
      success: true,
      version
    });
  } catch (error) {
    console.error('Get specific version error:', error);
    res.status(500).json({ error: 'Error retrieving version' });
  }
};

// @desc    Restore previous version
// @route   POST /api/admin/agent-config/:type/restore/:versionNumber
// @access  Private/Admin
exports.restoreVersion = async (req, res) => {
  try {
    const { type, versionNumber } = req.params;

    if (!['ask', 'background', 'create-tasks'].includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const versionToRestore = await AgentConfigVersion.findOne({
      type,
      version: parseInt(versionNumber)
    });

    if (!versionToRestore) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const config = await AgentConfig.findOne({ type });

    if (!config) {
      return res.status(404).json({ error: 'Agent configuration not found' });
    }

    // Create new version with restored content
    const newVersion = config.currentVersion + 1;

    await AgentConfigVersion.create({
      configId: config._id,
      type,
      version: newVersion,
      instructions: versionToRestore.instructions,
      valuePropositions: versionToRestore.valuePropositions,
      searchFunctions: versionToRestore.searchFunctions,
      notificationSettings: versionToRestore.notificationSettings,
      createdBy: req.user._id,
      changeNotes: `Restored from version ${versionNumber}`
    });

    // Update current config
    config.instructions = versionToRestore.instructions;
    if (versionToRestore.valuePropositions !== undefined) config.valuePropositions = versionToRestore.valuePropositions;
    config.searchFunctions = versionToRestore.searchFunctions;
    config.notificationSettings = versionToRestore.notificationSettings;
    config.currentVersion = newVersion;
    config.lastUpdated = Date.now();
    config.updatedBy = req.user._id;
    await config.save();

    await config.populate('updatedBy', 'name email');

    res.json({
      success: true,
      config,
      restoredFrom: parseInt(versionNumber),
      newVersion
    });
  } catch (error) {
    console.error('Restore version error:', error);
    res.status(500).json({ error: 'Error restoring version' });
  }
};

// @desc    Compare two versions
// @route   GET /api/admin/agent-config/:type/diff/:v1/:v2
// @access  Private/Admin
exports.compareVersions = async (req, res) => {
  try {
    const { type, v1, v2 } = req.params;

    if (!['ask', 'background', 'create-tasks'].includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const [version1, version2] = await Promise.all([
      AgentConfigVersion.findOne({ type, version: parseInt(v1) }),
      AgentConfigVersion.findOne({ type, version: parseInt(v2) })
    ]);

    if (!version1 || !version2) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    res.json({
      success: true,
      version1: {
        version: version1.version,
        instructions: version1.instructions,
        createdAt: version1.createdAt
      },
      version2: {
        version: version2.version,
        instructions: version2.instructions,
        createdAt: version2.createdAt
      }
    });
  } catch (error) {
    console.error('Compare versions error:', error);
    res.status(500).json({ error: 'Error comparing versions' });
  }
};

// @desc    Manually run background agent
// @route   POST /api/admin/agent/run
// @access  Private/Admin
exports.runBackgroundAgent = async (req, res) => {
  try {
    const result = await backgroundAgent.runIntelligenceCheck();

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Run background agent error:', error);
    res.status(500).json({ error: 'Error running background agent' });
  }
};
