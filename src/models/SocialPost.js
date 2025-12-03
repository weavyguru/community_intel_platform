const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema({
    blogPostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BlogPost',
        required: true
    },
    platformId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SocialPlatform',
        required: true
    },
    personaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Persona'
    },
    // Denormalized for display purposes
    platformName: {
        type: String,
        required: true
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
socialPostSchema.pre('save', function(next) {
    if (this.content) {
        this.characterCount = this.content.length;
    }
    next();
});

socialPostSchema.index({ blogPostId: 1, generatedAt: -1 });
socialPostSchema.index({ platformId: 1 });

module.exports = mongoose.model('SocialPost', socialPostSchema);
