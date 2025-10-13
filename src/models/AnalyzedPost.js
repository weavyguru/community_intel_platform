const mongoose = require('mongoose');

/**
 * AnalyzedPost Model
 *
 * Tracks posts that have been analyzed by background intelligence jobs
 * to prevent re-analyzing the same content across multiple runs.
 *
 * This deduplication happens BEFORE Haiku filter, saving both Haiku and Sonnet API calls.
 *
 * Posts can be re-analyzed after REANALYZE_WINDOW_DAYS (default 30 days) to account for:
 * - Content changes/edits
 * - Scoring matrix updates (v14, v15, etc.)
 * - Context shifts
 */

const analyzedPostSchema = new mongoose.Schema({
  // Primary identifier - post deeplink (unique URL to the post)
  deeplink: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Post metadata
  platform: {
    type: String,
    required: true
  },
  author: {
    type: String,
    required: true
  },

  // Analysis results from last Sonnet analysis
  lastAnalyzedAt: {
    type: Date,
    required: true,
    index: true // Indexed for time-based queries
  },
  lastAnalyzedScore: {
    type: Number,
    required: true,
    min: 0,
    max: 12
  },
  lastAnalyzedResponseType: {
    type: String,
    enum: ['pure-help', 'help-with-sprinkle', 'strong-fit', null],
    default: null
  },
  shouldEngage: {
    type: Boolean,
    required: true
  },

  // Historical tracking
  analyzedCount: {
    type: Number,
    default: 1,
    required: true
  },
  firstAnalyzedAt: {
    type: Date,
    required: true
  },

  // Optional: Store conversation ID where it was analyzed
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound index for efficient time-windowed queries
analyzedPostSchema.index({ deeplink: 1, lastAnalyzedAt: -1 });

// Static method to check if post was recently analyzed
analyzedPostSchema.statics.wasRecentlyAnalyzed = async function(deeplink, windowDays = 30) {
  const cutoffDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const analyzedPost = await this.findOne({
    deeplink: deeplink,
    lastAnalyzedAt: { $gte: cutoffDate }
  });

  return analyzedPost;
};

// Static method to mark post as analyzed
analyzedPostSchema.statics.markAsAnalyzed = async function(postData) {
  return await this.findOneAndUpdate(
    { deeplink: postData.deeplink },
    {
      $set: {
        deeplink: postData.deeplink,
        platform: postData.platform,
        author: postData.author,
        lastAnalyzedAt: new Date(),
        lastAnalyzedScore: postData.score,
        lastAnalyzedResponseType: postData.responseType || null,
        shouldEngage: postData.shouldEngage,
        conversationId: postData.conversationId || null
      },
      $inc: { analyzedCount: 1 },
      $setOnInsert: { firstAnalyzedAt: new Date() }
    },
    { upsert: true, new: true }
  );
};

// Static method to get deduplication stats
analyzedPostSchema.statics.getStats = async function() {
  const total = await this.countDocuments();
  const last30Days = await this.countDocuments({
    lastAnalyzedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  const last7Days = await this.countDocuments({
    lastAnalyzedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  });

  return {
    total,
    last30Days,
    last7Days
  };
};

const AnalyzedPost = mongoose.model('AnalyzedPost', analyzedPostSchema);

module.exports = AnalyzedPost;
