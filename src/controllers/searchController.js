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
    if (filters.platforms && filters.platforms.length > 0) chromaFilters.platforms = filters.platforms;
    if (filters.author) chromaFilters.author = filters.author;
    if (filters.intent) chromaFilters.intent = filters.intent;
    if (filters.startDate) chromaFilters.startDate = new Date(filters.startDate);
    if (filters.endDate) chromaFilters.endDate = new Date(filters.endDate);
    if (filters.includeComments !== undefined) chromaFilters.includeComments = filters.includeComments;

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

    // Collect log entries
    const logEntries = [];

    // Emit status update and log it
    const emitStatus = (message, detail = '', model = null) => {
      const logEntry = {
        message,
        detail,
        model,
        timestamp: new Date()
      };

      logEntries.push(logEntry);

      if (global.io) {
        global.io.emit('analysis:status', {
          userId: req.user._id.toString(),
          ...logEntry
        });
      }
    };

    // Build Chroma filters
    const chromaFilters = {};
    if (filters.platforms && filters.platforms.length > 0) chromaFilters.platforms = filters.platforms;
    if (filters.startDate) {
      chromaFilters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      chromaFilters.endDate = new Date(filters.endDate);
    }
    if (filters.includeComments !== undefined) chromaFilters.includeComments = filters.includeComments;

    // Build Chroma query details for display
    const chromaQueryDisplay = {
      query: question,
      limit: parseInt(contextLimit),
      filters: chromaFilters
    };

    // Search for relevant context
    emitStatus('Searching knowledge base', `Looking for ${contextLimit} relevant sources`, 'Chroma Vector DB');
    emitStatus(
      'Executing Chroma query',
      `Query: "${chromaQueryDisplay.query}"\nLimit: ${chromaQueryDisplay.limit}\nFilters: ${JSON.stringify(chromaQueryDisplay.filters, null, 2)}`,
      'Chroma Vector DB'
    );
    console.log(`Deep analysis: Searching for ${contextLimit} results with filters`, chromaFilters);
    const chromaResults = await chromaService.searchSemantic(
      question,
      parseInt(contextLimit),
      chromaFilters
    );

    // Summarize results
    const platformCounts = {};
    const dateRange = { earliest: null, latest: null };
    chromaResults.forEach(result => {
      const platform = result.metadata?.platform || 'unknown';
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;

      if (result.metadata?.timestamp) {
        const date = new Date(result.metadata.timestamp);
        if (!dateRange.earliest || date < dateRange.earliest) dateRange.earliest = date;
        if (!dateRange.latest || date > dateRange.latest) dateRange.latest = date;
      }
    });

    const platformSummary = Object.entries(platformCounts)
      .map(([platform, count]) => `${count} from ${platform}`)
      .join(', ');

    let resultSummary = `Found ${chromaResults.length} relevant sources: ${platformSummary}`;
    if (dateRange.earliest && dateRange.latest) {
      resultSummary += `\nDate range: ${dateRange.earliest.toLocaleDateString()} to ${dateRange.latest.toLocaleDateString()}`;
    }

    emitStatus('Knowledge retrieved', resultSummary);
    console.log(`Found ${chromaResults.length} results for analysis`);

    // Enhance the question for better analysis
    let enhancedQuestion = question;
    if (contextLimit > 25) {
      enhancedQuestion += `\n\nNote: This is a comprehensive analysis of ${chromaResults.length} community posts. Please provide a thorough, well-structured analysis covering all major themes and insights.`;
    }

    // Get the model being used
    const mainModel = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
    const titleModel = 'claude-haiku-3-5-20241022';

    // Ask Claude with enhanced context
    emitStatus('Analyzing with Claude AI', `Using ${chromaResults.length} sources for comprehensive analysis`, mainModel);
    const response = await claudeService.askWithContext(
      enhancedQuestion,
      chromaResults,
      instructions
    );

    emitStatus('Generating title', 'Creating concise title for analysis', titleModel);
    // Generate title using Haiku 3.5
    const title = await claudeService.generateTitle(question);

    emitStatus('Saving to database', 'Storing analysis and sources');

    // Determine analysis depth
    const analysisDepth = contextLimit > 50 ? 'comprehensive' : contextLimit > 25 ? 'deep' : contextLimit > 10 ? 'standard' : 'quick';

    // Prepare sources with deeplinks
    const sources = chromaResults.map(result => ({
      id: result.id,
      platform: result.metadata?.platform,
      author: result.metadata?.author,
      content: result.content,
      deeplink: result.metadata?.deeplink,
      relevanceScore: result.relevanceScore,
      timestamp: result.metadata?.timestamp ? new Date(result.metadata.timestamp) : undefined
    }));

    // Save conversation to MongoDB
    const conversation = await ClaudeConversation.create({
      title,
      question,
      answer: response.answer,
      analysisDepth,
      sourcesAnalyzed: chromaResults.length,
      sources,
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
        model: mainModel
      },
      log: logEntries,
      createdBy: req.user._id
    });

    console.log(`Saved conversation: ${conversation._id} - "${title}"`);

    emitStatus('Analysis complete', `"${title}" saved successfully`);

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
