const mongoose = require('mongoose');

const socialPlatformSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    instructions: {
        type: String,
        required: true
    },
    url: {
        type: String,
        trim: true,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

socialPlatformSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

socialPlatformSchema.index({ isActive: 1, sortOrder: 1 });
socialPlatformSchema.index({ name: 1 });

module.exports = mongoose.model('SocialPlatform', socialPlatformSchema);
