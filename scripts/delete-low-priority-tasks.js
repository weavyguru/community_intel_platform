/**
 * Script to delete all LOW priority tasks from the database
 * Run with: node scripts/delete-low-priority-tasks.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function deleteLowPriorityTasks() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const Task = require('../src/models/Task');

    // Count first
    const count = await Task.countDocuments({ priority: 'low' });
    console.log(`Found ${count} LOW priority tasks`);

    if (count === 0) {
      console.log('No tasks to delete.');
      return;
    }

    // Delete all low priority tasks
    const result = await Task.deleteMany({ priority: 'low' });
    console.log(`Deleted ${result.deletedCount} LOW priority tasks`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

deleteLowPriorityTasks();
