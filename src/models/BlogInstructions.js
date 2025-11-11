const mongoose = require('mongoose');

const blogInstructionsSchema = new mongoose.Schema({
    version: {
        type: Number,
        required: true
    },
    instructions: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        default: ''
    }
});

// Index for quick lookup of active version
blogInstructionsSchema.index({ isActive: 1 });
blogInstructionsSchema.index({ version: -1 });

module.exports = mongoose.model('BlogInstructions', blogInstructionsSchema);
