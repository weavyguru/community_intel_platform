const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  // Blog content
  title: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: {
    type: String,
    trim: true
  },
  body: {
    type: String,
    required: true
  },

  // Cover images (multiple variations generated)
  coverImages: [{
    url: String,
    filename: String,
    isSelected: Boolean
  }],

  // Selected cover image for publishing
  selectedCoverImage: {
    url: String,
    filename: String
  },

  // SEO
  metaDescription: {
    type: String,
    trim: true
  },
  slug: {
    type: String,
    trim: true
  },

  // Publishing
  status: {
    type: String,
    enum: ['draft', 'generating', 'ready', 'published', 'failed'],
    default: 'draft'
  },
  publishedToHubSpot: {
    type: Boolean,
    default: false
  },
  hubSpotPostId: {
    type: String
  },
  hubSpotUrl: {
    type: String
  },
  publishedAt: {
    type: Date
  },

  // Generation metadata
  topic: {
    type: String,
    required: true
  },
  synopsis: {
    type: String
  },
  relevanceReason: {
    type: String
  },

  // Source data from Chroma search
  sources: [{
    platform: String,
    url: String,
    content: String,
    timestamp: Date,
    relevance_score: Number
  }],

  // AI generation tracking
  generationLog: [{
    step: String,
    timestamp: Date,
    status: String,
    message: String,
    model: String,
    tokens: Number
  }],

  // Icons used for cover image
  selectedIcons: [{
    name: String,
    reasoning: String
  }],

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
blogPostSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
blogPostSchema.index({ status: 1, createdAt: -1 });
blogPostSchema.index({ publishedToHubSpot: 1, publishedAt: -1 });
blogPostSchema.index({ createdBy: 1, createdAt: -1 });

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

module.exports = BlogPost;
