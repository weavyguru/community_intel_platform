const mongoose = require('mongoose');

const standalonePostSchema = new mongoose.Schema({
    // Group identifier - all posts from same generation share this
    generationId: {
        type: String,
        required: true,
        index: true
    },

    // Search context
    userQuery: {
        type: String,
        required: true
    },

    // Post content
    platformId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SocialPlatform'
    },
    platformName: {
        type: String,
        required: true
    },
    personaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Persona'
    },
    personaName: {
        type: String,
        default: 'Neutral'
    },
    content: {
        type: String,
        required: true
    },
    characterCount: {
        type: Number
    },
    charLengthSetting: {
        type: String,
        default: '1200-1800'
    },

    // Shared image (same URL for all posts in generation)
    imageUrl: {
        type: String
    },
    imagePrompt: {
        type: String
    },

    generatedAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

// Auto-calculate character count before save
standalonePostSchema.pre('save', function(next) {
    if (this.content) {
        this.characterCount = this.content.length;
    }
    next();
});

// Indexes
standalonePostSchema.index({ generationId: 1, platformName: 1 });
standalonePostSchema.index({ createdBy: 1, generatedAt: -1 });
standalonePostSchema.index({ generatedAt: -1 });

module.exports = mongoose.model('StandalonePost', standalonePostSchema);
