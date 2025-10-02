const Task = require('../models/Task');
const User = require('../models/User');
const emailService = require('../services/emailService');

// @desc    Get all tasks with filters
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res) => {
  try {
    const {
      completed,
      priority,
      platform,
      intent,
      limit = 50,
      skip = 0
    } = req.query;

    const query = {};

    if (completed !== undefined) {
      query.isCompleted = completed === 'true';
    }

    if (priority) {
      query.priority = priority;
    }

    if (platform) {
      query.platform = platform;
    }

    if (intent) {
      query.intent = intent;
    }

    const tasks = await Task.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('completedBy', 'name email')
      .populate('delegatedTo', 'name email');

    const total = await Task.countDocuments(query);

    res.json({
      success: true,
      count: tasks.length,
      total,
      tasks
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Error retrieving tasks' });
  }
};

// @desc    Get uncompleted task count
// @route   GET /api/tasks/count
// @access  Private
exports.getTaskCount = async (req, res) => {
  try {
    const count = await Task.countDocuments({ isCompleted: false });

    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Get task count error:', error);
    res.status(500).json({ error: 'Error retrieving task count' });
  }
};

// @desc    Get task statistics
// @route   GET /api/tasks/stats
// @access  Private
exports.getTaskStats = async (req, res) => {
  try {
    const openCount = await Task.countDocuments({ isCompleted: false });

    // Get completed today count
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const completedTodayCount = await Task.countDocuments({
      isCompleted: true,
      completedAt: { $gte: startOfDay }
    });

    // Get high priority count
    const highPriorityCount = await Task.countDocuments({
      isCompleted: false,
      priority: 'high'
    });

    res.json({
      success: true,
      stats: {
        open: openCount,
        completedToday: completedTodayCount,
        highPriority: highPriorityCount
      }
    });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ error: 'Error retrieving task stats' });
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
exports.getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('completedBy', 'name email')
      .populate('delegatedTo', 'name email');

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Error retrieving task' });
  }
};

// @desc    Mark task as complete
// @route   PUT /api/tasks/:id/complete
// @access  Private
exports.completeTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.isCompleted = true;
    task.completedBy = req.user._id;
    task.completedAt = Date.now();
    await task.save();

    await task.populate('completedBy', 'name email');

    // Emit socket event for real-time update
    if (global.io) {
      global.io.emit('task:updated', {
        taskId: task._id.toString(),
        isCompleted: true
      });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Error completing task' });
  }
};

// @desc    Reopen task
// @route   PUT /api/tasks/:id/reopen
// @access  Private
exports.reopenTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.isCompleted = false;
    task.completedBy = undefined;
    task.completedAt = undefined;
    await task.save();

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Reopen task error:', error);
    res.status(500).json({ error: 'Error reopening task' });
  }
};

// @desc    Delete task (admin only)
// @route   DELETE /api/tasks/:id
// @access  Private/Admin
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await task.deleteOne();

    res.json({
      success: true,
      message: 'Task deleted'
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Error deleting task' });
  }
};

// @desc    Update task priority (admin only)
// @route   PUT /api/tasks/:id/priority
// @access  Private/Admin
exports.updatePriority = async (req, res) => {
  try {
    const { priority } = req.body;

    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority value' });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.priority = priority;
    await task.save();

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Update priority error:', error);
    res.status(500).json({ error: 'Error updating task priority' });
  }
};

// @desc    Delegate task to user
// @route   PUT /api/tasks/:id/delegate
// @access  Private
exports.delegateTask = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    task.delegatedTo = userId;
    task.delegatedAt = Date.now();
    await task.save();

    await task.populate('delegatedTo', 'name email');

    // Send delegation email
    await emailService.sendTaskDelegationEmail(task, user);

    // Emit socket event for real-time update
    if (global.io) {
      global.io.emit('task:delegated', {
        taskId: task._id.toString(),
        delegatedTo: {
          _id: user._id,
          name: user.name,
          email: user.email
        }
      });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Delegate task error:', error);
    res.status(500).json({ error: 'Error delegating task: ' + error.message });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email role').sort({ name: 1 });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Error retrieving users' });
  }
};
