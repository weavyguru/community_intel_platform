const mongoose = require('mongoose');

const jobRunHistorySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, required: true },
  success: { type: Boolean, required: true },
  result: {
    processed: Number,      // Total items fetched from Chroma
    analyzed: Number,       // Items after deduplication
    tasksCreated: Number,   // Tasks auto-created
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClaudeConversation' },
    duration: Number        // Milliseconds
  },
  error: String             // Error message if failed
});

// Index for faster queries (most recent first)
jobRunHistorySchema.index({ timestamp: -1 });

module.exports = mongoose.model('JobRunHistory', jobRunHistorySchema);
