const BlogInstructions = require('../models/BlogInstructions');

// Default instructions (what's currently in the code)
const DEFAULT_TOPIC_INSTRUCTIONS = `You are a content strategist analyzing community feedback to suggest blog post topics.

Guidelines:
- Topics should address real pain points, questions, or interests shown in the data
- Titles should be specific and actionable (e.g., "5 Ways to Fix Authentication Errors in Lovable" not "Authentication Best Practices")
- Each topic should be distinct and cover different aspects
- Prioritize topics with clear evidence from multiple community posts
- Make topics practical and helpful`;

const DEFAULT_POST_INSTRUCTIONS = `You are an expert technical content writer creating a blog post for a developer audience.

Guidelines:
- Write in a clear, engaging, conversational tone
- Use real examples and insights from the community data
- Include code examples where relevant (use proper HTML code blocks)
- Make it practical and actionable
- Length: 800-1500 words
- Use proper HTML formatting (h2, h3, p, ul, ol, code, pre, strong, em tags)
- Start with a compelling introduction
- Use subheadings to organize content
- End with a clear conclusion or call-to-action`;

/**
 * Get the active blog instructions
 */
exports.getActiveInstructions = async (req, res) => {
    try {
        let instructions = await BlogInstructions.findOne({ isActive: true });

        if (!instructions) {
            // Create default instructions if none exist
            const instructionData = {
                version: 1,
                instructions: JSON.stringify({
                    topicGeneration: DEFAULT_TOPIC_INSTRUCTIONS,
                    postGeneration: DEFAULT_POST_INSTRUCTIONS
                }, null, 2),
                isActive: true,
                notes: 'Default instructions'
            };

            // Add createdBy if user is authenticated
            if (req.user && req.user._id) {
                instructionData.createdBy = req.user._id;
            }

            instructions = await BlogInstructions.create(instructionData);
        }

        return res.json({
            success: true,
            instructions
        });
    } catch (error) {
        console.error('Error getting active instructions:', error);
        return res.status(500).json({
            error: 'Failed to get instructions',
            message: error.message
        });
    }
};

/**
 * Get all instruction versions
 */
exports.getAllVersions = async (req, res) => {
    try {
        const versions = await BlogInstructions.find()
            .sort({ version: -1 })
            .populate('createdBy', 'username email');

        return res.json({
            success: true,
            versions
        });
    } catch (error) {
        console.error('Error getting instruction versions:', error);
        return res.status(500).json({
            error: 'Failed to get versions',
            message: error.message
        });
    }
};

/**
 * Create a new version of instructions
 */
exports.createVersion = async (req, res) => {
    try {
        const { instructions, notes } = req.body;

        if (!instructions) {
            return res.status(400).json({ error: 'Instructions are required' });
        }

        // Get the latest version number
        const latestVersion = await BlogInstructions.findOne().sort({ version: -1 });
        const newVersion = latestVersion ? latestVersion.version + 1 : 1;

        // Deactivate all existing versions
        await BlogInstructions.updateMany({}, { isActive: false });

        // Create new version
        const newInstructionData = {
            version: newVersion,
            instructions,
            isActive: true,
            notes: notes || ''
        };

        // Add createdBy if user is authenticated
        if (req.user && req.user._id) {
            newInstructionData.createdBy = req.user._id;
        }

        const newInstructions = await BlogInstructions.create(newInstructionData);

        return res.json({
            success: true,
            instructions: newInstructions
        });
    } catch (error) {
        console.error('Error creating instruction version:', error);
        return res.status(500).json({
            error: 'Failed to create version',
            message: error.message
        });
    }
};

/**
 * Activate a specific version
 */
exports.activateVersion = async (req, res) => {
    try {
        const { id } = req.params;

        // Deactivate all versions
        await BlogInstructions.updateMany({}, { isActive: false });

        // Activate the specified version
        const instructions = await BlogInstructions.findByIdAndUpdate(
            id,
            { isActive: true },
            { new: true }
        );

        if (!instructions) {
            return res.status(404).json({ error: 'Version not found' });
        }

        return res.json({
            success: true,
            instructions
        });
    } catch (error) {
        console.error('Error activating version:', error);
        return res.status(500).json({
            error: 'Failed to activate version',
            message: error.message
        });
    }
};

module.exports = exports;
