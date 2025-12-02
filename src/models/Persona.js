const mongoose = require('mongoose');

const personaSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        trim: true
    },
    // Instructions that modify post writing style
    postModifier: {
        type: String,
        default: ''
    },
    // Is this the default "Neutral" persona?
    isDefault: {
        type: Boolean,
        default: false
    },
    // Is this persona active/available for selection?
    isActive: {
        type: Boolean,
        default: true
    },
    // Order for display in dropdown
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

personaSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Indexes
personaSchema.index({ isActive: 1, sortOrder: 1 });
personaSchema.index({ isDefault: 1 });
personaSchema.index({ name: 1 });

module.exports = mongoose.model('Persona', personaSchema);
