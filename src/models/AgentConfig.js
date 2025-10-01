const mongoose = require('mongoose');

const agentConfigSchema = new mongoose.Schema({
  type: { type: String, enum: ['ask', 'background'], required: true, unique: true },
  instructions: { type: String, required: true }, // Current Markdown instructions
  searchFunctions: [{
    name: String,
    description: String,
    parameters: mongoose.Schema.Types.Mixed
  }],
  notificationSettings: {
    enabled: { type: Boolean, default: true },
    keywords: [String],
    intents: [String],
    minPriority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
  },
  currentVersion: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const agentConfigVersionSchema = new mongoose.Schema({
  configId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentConfig', required: true },
  type: { type: String, enum: ['ask', 'background'], required: true },
  version: { type: Number, required: true },
  instructions: { type: String, required: true }, // Markdown format
  searchFunctions: [{
    name: String,
    description: String,
    parameters: mongoose.Schema.Types.Mixed
  }],
  notificationSettings: {
    enabled: { type: Boolean, default: true },
    keywords: [String],
    intents: [String],
    minPriority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
  },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changeNotes: String // Optional description of what changed
});

// Index for faster queries
agentConfigVersionSchema.index({ configId: 1, version: -1 });
agentConfigVersionSchema.index({ type: 1, version: -1 });

const AgentConfig = mongoose.model('AgentConfig', agentConfigSchema);
const AgentConfigVersion = mongoose.model('AgentConfigVersion', agentConfigVersionSchema);

module.exports = { AgentConfig, AgentConfigVersion };
