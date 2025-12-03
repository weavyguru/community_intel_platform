const SocialPlatform = require('../models/SocialPlatform');

// @desc    Get all active social platforms
// @route   GET /api/blog/social-platforms
exports.getAll = async (req, res) => {
    try {
        const platforms = await SocialPlatform.find({ isActive: true })
            .sort({ sortOrder: 1, name: 1 })
            .lean();

        res.json({
            success: true,
            platforms
        });
    } catch (error) {
        console.error('Error fetching social platforms:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch social platforms'
        });
    }
};

// @desc    Get single platform by ID
// @route   GET /api/blog/social-platforms/:id
exports.getOne = async (req, res) => {
    try {
        const platform = await SocialPlatform.findById(req.params.id).lean();

        if (!platform) {
            return res.status(404).json({
                success: false,
                error: 'Platform not found'
            });
        }

        res.json({
            success: true,
            platform
        });
    } catch (error) {
        console.error('Error fetching platform:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch platform'
        });
    }
};

// @desc    Create new social platform
// @route   POST /api/blog/social-platforms
exports.create = async (req, res) => {
    try {
        const { name, instructions } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Platform name is required'
            });
        }

        if (!instructions || !instructions.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Platform instructions are required'
            });
        }

        // Check if name already exists
        const existing = await SocialPlatform.findOne({ name: name.trim() });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'A platform with this name already exists'
            });
        }

        // Get max sortOrder
        const maxSort = await SocialPlatform.findOne().sort({ sortOrder: -1 }).select('sortOrder');
        const sortOrder = (maxSort?.sortOrder || 0) + 1;

        const platform = await SocialPlatform.create({
            name: name.trim(),
            instructions: instructions.trim(),
            isActive: true,
            sortOrder,
            createdBy: req.user?._id || null
        });

        res.status(201).json({
            success: true,
            platform
        });
    } catch (error) {
        console.error('Error creating social platform:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create social platform'
        });
    }
};

// @desc    Update social platform
// @route   PUT /api/blog/social-platforms/:id
exports.update = async (req, res) => {
    try {
        const { name, instructions } = req.body;

        const platform = await SocialPlatform.findById(req.params.id);

        if (!platform) {
            return res.status(404).json({
                success: false,
                error: 'Platform not found'
            });
        }

        // Check if new name conflicts with existing
        if (name && name.trim() !== platform.name) {
            const existing = await SocialPlatform.findOne({
                name: name.trim(),
                _id: { $ne: platform._id }
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    error: 'A platform with this name already exists'
                });
            }
        }

        if (name) platform.name = name.trim();
        if (instructions !== undefined) platform.instructions = instructions.trim();

        await platform.save();

        res.json({
            success: true,
            platform
        });
    } catch (error) {
        console.error('Error updating social platform:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update social platform'
        });
    }
};

// @desc    Delete social platform (soft delete)
// @route   DELETE /api/blog/social-platforms/:id
exports.delete = async (req, res) => {
    try {
        const platform = await SocialPlatform.findById(req.params.id);

        if (!platform) {
            return res.status(404).json({
                success: false,
                error: 'Platform not found'
            });
        }

        // Soft delete
        platform.isActive = false;
        await platform.save();

        res.json({
            success: true,
            message: 'Platform deleted'
        });
    } catch (error) {
        console.error('Error deleting social platform:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete social platform'
        });
    }
};
