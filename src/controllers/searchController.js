const chromaService = require('../services/chromaService');
const claudeService = require('../services/claudeService');
const { AgentConfig } = require('../models/AgentConfig');
const ClaudeConversation = require('../models/ClaudeConversation');

// @desc    Semantic search in Chroma DB
// @route   POST /api/search
// @access  Private
exports.search = async (req, res) => {
  try {
    const { query, limit = 10, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Parse filters
    const chromaFilters = {};
    if (filters.platform) chromaFilters.platform = filters.platform;
    if (filters.author) chromaFilters.author = filters.author;
    if (filters.intent) chromaFilters.intent = filters.intent;
    if (filters.startDate) chromaFilters.startDate = new Date(filters.startDate);
    if (filters.endDate) chromaFilters.endDate = new Date(filters.endDate);

    const results = await chromaService.searchSemantic(query, parseInt(limit), chromaFilters);

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Error performing search' });
  }
};

// @desc    Ask Claude with Chroma context (Deep Analysis)
// @route   POST /api/ask
// @access  Private
exports.ask = async (req, res) => {
  try {
    const {
      question,
      contextLimit = 25,
      includePatterns = false,
      includeTrends = false,
      filters = {}
    } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Get agent instructions
    const config = await AgentConfig.findOne({ type: 'ask' });
    let instructions = config?.instructions || 'You are a helpful AI assistant analyzing community feedback.';

    // Enhance instructions based on analysis options
    if (includePatterns || includeTrends) {
      instructions += '\n\n## Additional Analysis Requirements:\n';
      if (includePatterns) {
        instructions += '- Identify recurring patterns and themes across the data\n';
        instructions += '- Group similar feedback and requests\n';
        instructions += '- Highlight common pain points\n';
      }
      if (includeTrends) {
        instructions += '- Analyze trends over time if timestamps are available\n';
        instructions += '- Note if certain topics are increasing or decreasing\n';
        instructions += '- Identify emerging patterns\n';
      }
    }

    // Build Chroma filters
    const chromaFilters = {};
    if (filters.platform) chromaFilters.platform = filters.platform;
    if (filters.startDate) {
      chromaFilters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      chromaFilters.endDate = new Date(filters.endDate);
    }

    // Search for relevant context
    console.log(`Deep analysis: Searching for ${contextLimit} results with filters`, chromaFilters);
    const chromaResults = await chromaService.searchSemantic(
      question,
      parseInt(contextLimit),
      chromaFilters
    );

    console.log(`Found ${chromaResults.length} results for analysis`);

    // Enhance the question for better analysis
    let enhancedQuestion = question;
    if (contextLimit > 25) {
      enhancedQuestion += `\n\nNote: This is a comprehensive analysis of ${chromaResults.length} community posts. Please provide a thorough, well-structured analysis covering all major themes and insights.`;
    }

    // Ask Claude with enhanced context
    const response = await claudeService.askWithContext(
      enhancedQuestion,
      chromaResults,
      instructions
    );

    // Generate title using Haiku 3.5
    const title = await claudeService.generateTitle(question);

    // Determine analysis depth
    const analysisDepth = contextLimit > 50 ? 'comprehensive' : contextLimit > 25 ? 'deep' : contextLimit > 10 ? 'standard' : 'quick';

    // Save conversation to MongoDB
    const conversation = await ClaudeConversation.create({
      title,
      question,
      answer: response.answer,
      analysisDepth,
      sourcesAnalyzed: chromaResults.length,
      filters: {
        platform: filters.platform,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined
      },
      options: {
        includePatterns,
        includeTrends
      },
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        model: 'claude-sonnet-4-5-20250929'
      },
      createdBy: req.user._id
    });

    console.log(`Saved conversation: ${conversation._id} - "${title}"`);

    res.json({
      success: true,
      conversationId: conversation._id,
      title,
      answer: response.answer,
      sources: response.sources,
      sourcesAnalyzed: chromaResults.length,
      usage: response.usage,
      analysisDepth
    });
  } catch (error) {
    console.error('Ask error:', error);
    res.status(500).json({ error: 'Error processing question: ' + error.message });
  }
};

// @desc    Get available metadata filters
// @route   GET /api/search/filters
// @access  Private
exports.getFilters = async (req, res) => {
  try {
    const filters = await chromaService.getMetadataFilters();

    res.json({
      success: true,
      filters
    });
  } catch (error) {
    console.error('Get filters error:', error);
    res.status(500).json({ error: 'Error retrieving filters' });
  }
};

// @desc    Get recent conversations
// @route   GET /api/conversations/recent
// @access  Private
exports.getRecentConversations = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const conversations = await ClaudeConversation.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('title question createdAt analysisDepth sourcesAnalyzed')
      .populate('createdBy', 'name');

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    console.error('Get recent conversations error:', error);
    res.status(500).json({ error: 'Error retrieving conversations' });
  }
};

// @desc    Get single conversation
// @route   GET /api/conversations/:id
// @access  Private
exports.getConversation = async (req, res) => {
  try {
    const conversation = await ClaudeConversation.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Error retrieving conversation' });
  }
};

// @desc    Search conversations
// @route   GET /api/conversations/search
// @access  Private
exports.searchConversations = async (req, res) => {
  try {
    const { q, startDate, endDate, analysisDepth, limit = 50, skip = 0 } = req.query;

    const query = {};

    // Text search
    if (q) {
      query.$text = { $search: q };
    }

    // Date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Analysis depth filter
    if (analysisDepth) {
      query.analysisDepth = analysisDepth;
    }

    const conversations = await ClaudeConversation.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('title question answer createdAt analysisDepth sourcesAnalyzed')
      .populate('createdBy', 'name');

    const total = await ClaudeConversation.countDocuments(query);

    res.json({
      success: true,
      conversations,
      total,
      count: conversations.length
    });
  } catch (error) {
    console.error('Search conversations error:', error);
    res.status(500).json({ error: 'Error searching conversations' });
  }
};
