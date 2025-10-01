const Task = require('../models/Task');

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
      .populate('completedBy', 'name email');

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

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
exports.getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('completedBy', 'name email');

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
