const Persona = require('../models/Persona');

// @desc    Get all active personas
// @route   GET /api/blog/personas
// @access  Private
exports.getAllPersonas = async (req, res) => {
    try {
        const personas = await Persona.find({ isActive: true })
            .sort({ sortOrder: 1, name: 1 })
            .lean();

        res.json({
            success: true,
            personas
        });
    } catch (error) {
        console.error('Error fetching personas:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch personas'
        });
    }
};

// @desc    Get single persona by ID
// @route   GET /api/blog/personas/:id
// @access  Private
exports.getPersona = async (req, res) => {
    try {
        const persona = await Persona.findById(req.params.id).lean();

        if (!persona) {
            return res.status(404).json({
                success: false,
                error: 'Persona not found'
            });
        }

        res.json({
            success: true,
            persona
        });
    } catch (error) {
        console.error('Error fetching persona:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch persona'
        });
    }
};

// @desc    Create new persona
// @route   POST /api/blog/personas
// @access  Private
exports.createPersona = async (req, res) => {
    try {
        const { name, description, postModifier } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Persona name is required'
            });
        }

        // Check if name already exists
        const existing = await Persona.findOne({ name: name.trim() });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'A persona with this name already exists'
            });
        }

        // Get max sortOrder
        const maxSort = await Persona.findOne().sort({ sortOrder: -1 }).select('sortOrder');
        const sortOrder = (maxSort?.sortOrder || 0) + 1;

        const persona = await Persona.create({
            name: name.trim(),
            description: description?.trim() || '',
            postModifier: postModifier?.trim() || '',
            isDefault: false,
            isActive: true,
            sortOrder,
            createdBy: req.user?._id || null
        });

        res.status(201).json({
            success: true,
            persona
        });
    } catch (error) {
        console.error('Error creating persona:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create persona'
        });
    }
};

// @desc    Update persona
// @route   PUT /api/blog/personas/:id
// @access  Private
exports.updatePersona = async (req, res) => {
    try {
        const { name, description, postModifier } = req.body;

        const persona = await Persona.findById(req.params.id);

        if (!persona) {
            return res.status(404).json({
                success: false,
                error: 'Persona not found'
            });
        }

        // Don't allow editing the default persona's name
        if (persona.isDefault && name && name.trim() !== persona.name) {
            return res.status(400).json({
                success: false,
                error: 'Cannot rename the default persona'
            });
        }

        // Check if new name conflicts with existing
        if (name && name.trim() !== persona.name) {
            const existing = await Persona.findOne({ name: name.trim(), _id: { $ne: persona._id } });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    error: 'A persona with this name already exists'
                });
            }
        }

        if (name) persona.name = name.trim();
        if (description !== undefined) persona.description = description.trim();
        if (postModifier !== undefined) persona.postModifier = postModifier.trim();

        await persona.save();

        res.json({
            success: true,
            persona
        });
    } catch (error) {
        console.error('Error updating persona:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update persona'
        });
    }
};

// @desc    Delete persona (soft delete)
// @route   DELETE /api/blog/personas/:id
// @access  Private
exports.deletePersona = async (req, res) => {
    try {
        const persona = await Persona.findById(req.params.id);

        if (!persona) {
            return res.status(404).json({
                success: false,
                error: 'Persona not found'
            });
        }

        // Don't allow deleting the default persona
        if (persona.isDefault) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete the default persona'
            });
        }

        // Soft delete
        persona.isActive = false;
        await persona.save();

        res.json({
            success: true,
            message: 'Persona deleted'
        });
    } catch (error) {
        console.error('Error deleting persona:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete persona'
        });
    }
};
