const chromaService = require('../services/chromaService');
const claudeService = require('../services/claudeService');
const { AgentConfig } = require('../models/AgentConfig');
const ClaudeConversation = require('../models/ClaudeConversation');

// Helper function to filter out low-quality content
function filterLowQualityContent(results) {
  const LOW_QUALITY_PATTERNS = /^(why\?*|help|same|lol|\+1|same here|its annoying|it'?s annoying|very annoying|patience grasshopper|i could help|u can tell me)$/i;
  const MIN_POST_LENGTH = 50;
  const MIN_COMMENT_LENGTH = 100;

  return results.filter(result => {
    const content = result.content || '';
    const isComment = result.metadata?.is_comment === true;
    const trimmedContent = content.trim();

    // Check for low-quality patterns
    if (LOW_QUALITY_PATTERNS.test(trimmedContent)) {
      return false;
    }

    // Check minimum length based on type
    const minLength = isComment ? MIN_COMMENT_LENGTH : MIN_POST_LENGTH;
    if (trimmedContent.length < minLength) {
      return false;
    }

    return true;
  });
}

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

    // Collect log entries
    const logEntries = [];

    // Emit status update and log it
    const emitStatus = (message, detail = '', model = null, metadata = {}) => {
      const logEntry = {
        message,
        detail,
        model,
        timestamp: new Date(),
        ...metadata
      };

      logEntries.push(logEntry);

      if (global.io) {
        global.io.emit('analysis:status', {
          userId: req.user?._id?.toString() || 'anonymous',
          ...logEntry
        });
      }
    };

    // Build Chroma filters
    const chromaFilters = {};
    if (filters.startDate) {
      chromaFilters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      chromaFilters.endDate = new Date(filters.endDate);
    }

    // Get the main model being used
    const mainModel = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
    const mainModelName = 'Claude Sonnet 4.5';

    // STEP 1: Analyze search intent with Opus 4
    emitStatus('Analyzing question', `Using ${mainModelName} to understand your question and generate comprehensive search strategy`, mainModel);

    const availablePlatforms = await chromaService.getMetadataFilters();
    const platforms = availablePlatforms.platforms || [];

    const searchPlan = await claudeService.analyzeSearchIntent(question, platforms);

    // Validate search plan
    if (!searchPlan || !searchPlan.searchQueries || !Array.isArray(searchPlan.searchQueries) || searchPlan.searchQueries.length === 0) {
      console.error('Invalid search plan returned:', JSON.stringify(searchPlan, null, 2));
      emitStatus('Search plan error', 'Using fallback single query strategy', 'System');
      searchPlan.searchQueries = [{
        query: question,
        platforms: null,
        reason: 'Fallback query due to planning error',
        searchType: 'broad'
      }];
      searchPlan.reasoning = 'Using fallback single query strategy';
      searchPlan.queryComplexity = 'simple';
      searchPlan.expectedIterations = 1;
    }

    // Broadcast search strategy
    emitStatus(
      'Search strategy generated',
      `Complexity: ${searchPlan.queryComplexity}\n${searchPlan.searchQueries.length} initial ${searchPlan.searchQueries.length === 1 ? 'query' : 'queries'}\nExpected iterations: ${searchPlan.expectedIterations}\n\n${searchPlan.reasoning}`,
      mainModelName,
      {
        tokensUsed: searchPlan.usage,
        queryComplexity: searchPlan.queryComplexity,
        initialQueries: searchPlan.searchQueries.length
      }
    );
    console.log('Search plan:', JSON.stringify(searchPlan, null, 2));

    // STEP 2: Iterative search execution
    let allResults = [];
    const seenDeeplinks = new Set();
    const maxIterations = Math.min(searchPlan.expectedIterations || 1, 4); // Cap at 4 iterations
    let currentIteration = 1;
    let queriesToExecute = [...searchPlan.searchQueries];

    while (currentIteration <= maxIterations && queriesToExecute.length > 0) {
      emitStatus(
        `Starting iteration ${currentIteration}/${maxIterations}`,
        `Executing ${queriesToExecute.length} search ${queriesToExecute.length === 1 ? 'query' : 'queries'}`,
        'System',
        { iteration: currentIteration, totalIterations: maxIterations }
      );

      // Execute queries for this iteration (prioritize posts over comments)
      const resultsPerQuery = Math.ceil(parseInt(contextLimit) / queriesToExecute.length);

      for (let i = 0; i < queriesToExecute.length; i++) {
        const searchQuery = queriesToExecute[i];

        try {
          const platformInfo = searchQuery.platforms
            ? `Platforms: ${searchQuery.platforms.join(', ')}`
            : 'All platforms';

          emitStatus(
            `Query ${i + 1}/${queriesToExecute.length} (Iteration ${currentIteration})`,
            `Search: "${searchQuery.query}"\n${platformInfo}\nType: ${searchQuery.searchType}\nReason: ${searchQuery.reason}`,
            'Chroma Vector DB',
            {
              iteration: currentIteration,
              queryIndex: i + 1,
              totalQueries: queriesToExecute.length,
              searchType: searchQuery.searchType
            }
          );

          // Build filter for this specific query
          const queryFilters = { ...chromaFilters };
          if (searchQuery.platforms && searchQuery.platforms.length > 0) {
            queryFilters.platforms = searchQuery.platforms;
          }

          // TIER 1: Try to get posts first (is_comment: false)
          const postFilters = { ...queryFilters, isComment: false };
          const postsRaw = await chromaService.searchSemantic(
            searchQuery.query,
            resultsPerQuery * 3, // Fetch extra to account for duplicates and quality filtering
            postFilters
          );

          // Filter for quality
          const qualityPosts = filterLowQualityContent(postsRaw);

          // TIER 2: If we need more results, get high-quality comments
          let commentsRaw = [];
          if (qualityPosts.length < resultsPerQuery) {
            const commentFilters = { ...queryFilters, isComment: true };
            const needed = (resultsPerQuery - qualityPosts.length) * 3;
            commentsRaw = await chromaService.searchSemantic(
              searchQuery.query,
              needed,
              commentFilters
            );
          }

          // Filter comments for quality (stricter)
          const qualityComments = filterLowQualityContent(commentsRaw);

          // Combine posts and comments (posts first)
          const combinedResults = [...qualityPosts, ...qualityComments];

          // Add unique results
          let added = 0;
          for (const result of combinedResults) {
            const deeplink = result.metadata?.deeplink;
            if (!deeplink || !seenDeeplinks.has(deeplink)) {
              if (deeplink) seenDeeplinks.add(deeplink);
              allResults.push(result);
              added++;
              if (added >= resultsPerQuery) break;
            }
          }

          const postCount = qualityPosts.slice(0, added).length;
          const commentCount = added - postCount;

          emitStatus(
            `Query ${i + 1} complete`,
            `Added ${added} unique results: ${postCount} posts, ${commentCount} comments (${allResults.length} total accumulated)`,
            'Chroma Vector DB',
            { resultsAdded: added, postsAdded: postCount, commentsAdded: commentCount, totalResults: allResults.length }
          );
          console.log(`Iteration ${currentIteration}, Query ${i + 1}: "${searchQuery.query}" → ${added} unique results (${postCount} posts, ${commentCount} comments)`);

        } catch (error) {
          emitStatus(`Query ${i + 1} failed`, error.message, 'Chroma Vector DB', { error: true });
          console.error(`Error executing query ${i + 1}:`, error.message);
        }
      }

      // STEP 3: Evaluate if we need more iterations
      if (currentIteration < maxIterations) {
        emitStatus(
          `Evaluating search coverage`,
          `Analyzing ${allResults.length} results to determine if additional searches are needed`,
          mainModelName,
          { iteration: currentIteration }
        );

        const evaluation = await claudeService.evaluateSearchResults(
          question,
          allResults,
          searchPlan,
          currentIteration
        );

        emitStatus(
          'Coverage evaluation complete',
          `Complete: ${evaluation.isComplete}\nConfidence: ${evaluation.confidence}%\nGaps: ${evaluation.coverageGaps.join(', ') || 'None'}\n\n${evaluation.reasoning}`,
          mainModelName,
          {
            tokensUsed: evaluation.usage,
            isComplete: evaluation.isComplete,
            confidence: evaluation.confidence,
            gaps: evaluation.coverageGaps
          }
        );

        console.log('Evaluation:', JSON.stringify(evaluation, null, 2));

        // Check if we should continue
        if (evaluation.isComplete || evaluation.confidence >= 80) {
          emitStatus(
            'Search complete',
            `Sufficient coverage achieved with ${allResults.length} results (${evaluation.confidence}% confidence)`,
            'System'
          );
          break;
        } else if (evaluation.recommendedQueries && evaluation.recommendedQueries.length > 0) {
          queriesToExecute = evaluation.recommendedQueries;
          currentIteration++;
          emitStatus(
            'Additional searches needed',
            `Coverage gaps identified. Planning ${queriesToExecute.length} follow-up ${queriesToExecute.length === 1 ? 'query' : 'queries'}`,
            'System',
            { nextIteration: currentIteration }
          );
        } else {
          // No more queries suggested
          break;
        }
      } else {
        emitStatus(
          'Max iterations reached',
          `Completed ${maxIterations} search iterations with ${allResults.length} total results`,
          'System'
        );
        break;
      }
    }

    // Final deduplication and limiting
    const chromaResults = allResults.slice(0, parseInt(contextLimit));
    emitStatus('Finalizing results', `Collected ${allResults.length} unique sources across ${currentIteration} ${currentIteration === 1 ? 'iteration' : 'iterations'}, selecting top ${chromaResults.length} for analysis`, 'System');
    console.log(`Final result: ${chromaResults.length} unique sources (target was ${contextLimit})`);

    // STEP 4: Summarize collected results
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

    emitStatus(
      'Knowledge retrieved',
      resultSummary,
      'System',
      {
        totalResults: chromaResults.length,
        platformDistribution: platformCounts,
        dateRange: dateRange,
        iterations: currentIteration
      }
    );
    console.log(`Found ${chromaResults.length} results for analysis`);

    // STEP 5: Enhance the question for better analysis
    let enhancedQuestion = question;
    if (contextLimit > 25) {
      enhancedQuestion += `\n\nNote: This is a comprehensive analysis of ${chromaResults.length} community posts. Please provide a thorough, well-structured analysis covering all major themes and insights.`;
    }

    const titleModel = 'claude-3-5-haiku-20241022';

    // STEP 6: Perform final analysis with Claude
    emitStatus(
      'Analyzing with Claude AI',
      `Deep analysis of ${chromaResults.length} sources using ${mainModelName}\nThis may take a moment...`,
      mainModelName
    );

    const analysisStartTime = Date.now();
    const response = await claudeService.askWithContext(
      enhancedQuestion,
      chromaResults,
      instructions
    );
    const analysisTime = Date.now() - analysisStartTime;

    emitStatus(
      'Analysis complete',
      `Processed ${chromaResults.length} sources in ${(analysisTime / 1000).toFixed(1)}s`,
      mainModelName,
      {
        tokensUsed: response.usage,
        analysisTime: analysisTime,
        sourcesAnalyzed: chromaResults.length
      }
    );

    // STEP 7: Generate title using Haiku
    emitStatus('Generating title', 'Creating concise title for analysis', 'Claude Haiku 3.5');
    const title = await claudeService.generateTitle(question);

    // STEP 8: Save to database
    emitStatus('Saving to database', 'Storing analysis and sources', 'System');

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
      createdBy: req.user?._id || null
    });

    console.log(`Saved conversation: ${conversation._id} - "${title}"`);

    // STEP 9: Broadcast completion
    emitStatus(
      'Complete',
      `"${title}" saved successfully\n\nAnalysis Summary:\n- Iterations: ${currentIteration}\n- Sources analyzed: ${chromaResults.length}\n- Platforms: ${Object.keys(platformCounts).length}\n- Depth: ${analysisDepth}`,
      'System',
      {
        conversationId: conversation._id,
        totalIterations: currentIteration,
        sourcesAnalyzed: chromaResults.length,
        analysisDepth: analysisDepth
      }
    );

    res.json({
      success: true,
      conversationId: conversation._id,
      title,
      answer: response.answer,
      sources: response.sources,
      sourcesAnalyzed: chromaResults.length,
      usage: response.usage,
      analysisDepth,
      iterations: currentIteration
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

    const conversations = await ClaudeConversation.find({ backgroundGenerated: { $ne: true } })
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

    const query = { backgroundGenerated: { $ne: true } };

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
