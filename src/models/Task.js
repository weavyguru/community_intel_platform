const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  snippet: { type: String, required: true },
  sourceUrl: { type: String, required: true },
  platform: { type: String, enum: ['Discord', 'Reddit', 'X', 'LinkedIn'] },
  intent: String, // e.g., "add chat to app", "pricing question"
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  isCompleted: { type: Boolean, default: false },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt: Date,
  metadata: {
    author: String,
    timestamp: Date,
    engagement: Number, // likes, comments, etc.
    sentiment: String
  },
  createdAt: { type: Date, default: Date.now },
  foundByAgent: { type: Boolean, default: true }
});

// Index for faster queries
taskSchema.index({ isCompleted: 1, priority: -1, createdAt: -1 });
taskSchema.index({ platform: 1 });
taskSchema.index({ intent: 1 });

module.exports = mongoose.model('Task', taskSchema);
