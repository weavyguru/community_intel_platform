const mongoose = require('mongoose');

const blogTopicSchema = new mongoose.Schema({
  // The original user query/request
  userQuery: {
    type: String,
    required: true
  },

  // Topics suggested by the planner
  topics: [{
    title: {
      type: String,
      required: true
    },
    synopsis: {
      type: String,
      required: true
    },
    relevanceReason: {
      type: String,
      required: true
    },
    selected: {
      type: Boolean,
      default: false
    },
    blogPostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BlogPost'
    }
  }],

  // Search results that informed the topics
  searchResults: [{
    platform: String,
    url: String,
    content: String,
    timestamp: Date,
    relevance_score: Number
  }],

  // Search strategy and execution log
  searchLog: [{
    step: String,
    timestamp: Date,
    status: String,
    message: String,
    model: String,
    tokens: Number,
    iteration: Number,
    queriesExecuted: [String]
  }],

  // Time window used for search
  searchTimeWindow: {
    startDate: Date,
    endDate: Date,
    days: Number
  },

  // Status tracking
  status: {
    type: String,
    enum: ['searching', 'planning', 'ready', 'completed', 'failed'],
    default: 'searching'
  },

  // User tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
blogTopicSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
blogTopicSchema.index({ status: 1, createdAt: -1 });
blogTopicSchema.index({ createdBy: 1, createdAt: -1 });

const BlogTopic = mongoose.model('BlogTopic', blogTopicSchema);

module.exports = BlogTopic;
