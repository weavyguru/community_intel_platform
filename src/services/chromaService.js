const { getChromaClient } = require('../config/chroma');

const COLLECTION_NAME = 'community_content';

// Known platforms in the database (plain text for semantic search)
const KNOWN_PLATFORMS = [
  'floot',
  'orchids',
  'lovable',
  'replit',
  'base44',
  'v0',
  'appsmith',
  'retool',
  'bolt',
  'refine'
];

class ChromaService {
  constructor() {
    this.client = null;
    this.collection = null;
    this.platformCache = new Set(); // Cache discovered platforms
  }

  async initialize() {
    if (!this.client) {
      this.client = await getChromaClient();
      this.collection = await this.client.getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: { description: 'Community content from Discord, Reddit, X, and LinkedIn' }
      });
    }
    return this.collection;
  }

  async searchSemantic(query, limit = 10, filters = {}) {
    try {
      await this.initialize();

      const where = this._buildWhereClause(filters);

      const results = await this.collection.query({
        queryTexts: [query.toLowerCase()],
        nResults: limit,
        where: Object.keys(where).length > 0 ? where : undefined
      });

      // Debug logging
      console.log(`Chroma query returned: ${results.ids ? results.ids[0]?.length || 0 : 0} results`);
      if (results.ids && results.ids[0]?.length > 0) {
        // Check for duplicates by deeplink and count platforms
        const deeplinks = results.metadatas[0].map(m => m.deeplink).filter(Boolean);
        const uniqueDeeplinks = new Set(deeplinks);
        const platformCounts = {};
        const commentCounts = { posts: 0, comments: 0, unknown: 0 };
        results.metadatas[0].forEach(m => {
          const platform = m.platform || 'unknown';
          platformCounts[platform] = (platformCounts[platform] || 0) + 1;

          // Count is_comment values
          if (m.is_comment === true) commentCounts.comments++;
          else if (m.is_comment === false) commentCounts.posts++;
          else commentCounts.unknown++;
        });
        console.log(`Total results: ${results.ids[0].length}, Unique deeplinks: ${uniqueDeeplinks.size}`);
        console.log(`Platforms in results:`, platformCounts);
        console.log(`is_comment breakdown:`, commentCounts);

        // Sample first result's metadata
        if (results.metadatas[0].length > 0) {
          console.log(`Sample metadata:`, {
            is_comment: results.metadatas[0][0].is_comment,
            is_comment_type: typeof results.metadatas[0][0].is_comment,
            platform: results.metadatas[0][0].platform,
            deeplink: results.metadatas[0][0].deeplink
          });
        }

        // Log the where clause being used
        console.log(`Where clause used:`, JSON.stringify(where));
      }

      return this._formatResults(results);
    } catch (error) {
      console.error('Error in semantic search:', error);
      throw error;
    }
  }

  async searchByIntent(intent, limit = 20) {
    try {
      await this.initialize();

      const results = await this.collection.query({
        queryTexts: [intent],
        nResults: limit,
        where: { intent: { $eq: intent } }
      });

      return this._formatResults(results);
    } catch (error) {
      console.error('Error in intent search:', error);
      throw error;
    }
  }

  async searchByTimeRange(startDate, endDate, limit = null) {
    try {
      await this.initialize();

      // Convert dates to Unix timestamps (seconds since epoch)
      const startUnix = Math.floor(startDate.getTime() / 1000);
      const endUnix = Math.floor(endDate.getTime() / 1000);

      // If no limit specified, get ALL results (handle pagination)
      if (limit === null) {
        let allResults = [];
        let offset = 0;
        const batchSize = 100; // ChromaDB pagination limit
        let hasMore = true;

        while (hasMore) {
          const results = await this.collection.get({
            where: {
              $and: [
                { timestamp_unix: { $gte: startUnix } },
                { timestamp_unix: { $lte: endUnix } }
              ]
            },
            limit: batchSize,
            offset: offset
          });

          const formatted = this._formatGetResults(results);
          allResults = allResults.concat(formatted);

          // Check if we got fewer results than requested (means we're at the end)
          hasMore = results.ids.length === batchSize;
          offset += batchSize;

          console.log(`Fetched batch: ${formatted.length} items (offset: ${offset - batchSize}, total so far: ${allResults.length})`);
        }

        console.log(`Total items fetched from time range: ${allResults.length}`);
        return allResults;
      }

      // If limit specified, use it directly
      const results = await this.collection.get({
        where: {
          $and: [
            { timestamp_unix: { $gte: startUnix } },
            { timestamp_unix: { $lte: endUnix } }
          ]
        },
        limit
      });

      return this._formatGetResults(results);
    } catch (error) {
      console.error('Error in time range search:', error);
      throw error;
    }
  }

  async getDocumentById(id) {
    try {
      await this.initialize();

      const results = await this.collection.get({
        ids: [id]
      });

      if (results.ids.length === 0) {
        return null;
      }

      return this._formatGetResults(results)[0];
    } catch (error) {
      console.error('Error getting document by ID:', error);
      throw error;
    }
  }

  async getMetadataFilters() {
    // Return hardcoded platform list
    console.log(`Using known platforms (${KNOWN_PLATFORMS.length}):`, KNOWN_PLATFORMS);
    return {
      platforms: KNOWN_PLATFORMS,
      authors: [],
      intents: []
    };
  }

  async addDocuments(documents) {
    try {
      await this.initialize();

      const ids = documents.map((_, i) => `doc_${Date.now()}_${i}`);
      const embeddings = null; // Let Chroma generate embeddings
      const metadatas = documents.map(doc => doc.metadata);
      const texts = documents.map(doc => doc.content);

      await this.collection.add({
        ids,
        metadatas,
        documents: texts
      });

      return ids;
    } catch (error) {
      console.error('Error adding documents:', error);
      throw error;
    }
  }

  _buildWhereClause(filters) {
    const conditions = [];

    // Date filtering using timestamp_unix
    if (filters.startDate || filters.endDate) {
      if (filters.startDate && filters.endDate) {
        const startUnix = Math.floor(filters.startDate.getTime() / 1000);
        const endUnix = Math.floor(filters.endDate.getTime() / 1000);
        conditions.push({
          $and: [
            { timestamp_unix: { $gte: startUnix } },
            { timestamp_unix: { $lte: endUnix } }
          ]
        });
      } else if (filters.startDate) {
        const startUnix = Math.floor(filters.startDate.getTime() / 1000);
        conditions.push({ timestamp_unix: { $gte: startUnix } });
      } else if (filters.endDate) {
        const endUnix = Math.floor(filters.endDate.getTime() / 1000);
        conditions.push({ timestamp_unix: { $lte: endUnix } });
      }
    }

    // Platform filtering
    if (filters.platforms && filters.platforms.length > 0) {
      conditions.push({ platform: { $in: filters.platforms } });
    }

    // is_comment filtering (prioritize posts over comments)
    if (filters.isComment !== undefined) {
      conditions.push({ is_comment: { $eq: filters.isComment } });
    }

    // Combine conditions
    if (conditions.length === 0) {
      return {};
    } else if (conditions.length === 1) {
      return conditions[0];
    } else {
      return { $and: conditions };
    }
  }

  _formatResults(results) {
    if (!results.ids || results.ids.length === 0) {
      return [];
    }

    const formatted = [];
    const seenDeeplinks = new Set();

    for (let i = 0; i < results.ids[0].length; i++) {
      const distance = results.distances ? results.distances[0][i] : null;
      const deeplink = results.metadatas[0][i]?.deeplink;
      const metadata = results.metadatas[0][i];

      // Skip duplicates based on deeplink
      if (deeplink && seenDeeplinks.has(deeplink)) {
        continue;
      }
      if (deeplink) {
        seenDeeplinks.add(deeplink);
      }

      // Chroma returns L2 (Euclidean) distance by default
      // Lower distance = more similar (0 = identical)
      // Convert to a similarity score: we'll just use negative distance so lower is better
      // This preserves the ordering and makes it clear that lower = better match
      const relevanceScore = distance !== null ? -distance : null;

      // Cache platform for future queries
      if (metadata.platform) {
        this.platformCache.add(metadata.platform);
      }

      formatted.push({
        id: results.ids[0][i],
        content: results.documents[0][i],
        metadata: metadata,
        distance: distance,
        relevanceScore: relevanceScore
      });
    }

    return formatted;
  }

  _formatGetResults(results) {
    if (!results.ids || results.ids.length === 0) {
      return [];
    }

    const formatted = [];
    for (let i = 0; i < results.ids.length; i++) {
      formatted.push({
        id: results.ids[i],
        content: results.documents[i],
        metadata: results.metadatas[i]
      });
    }

    return formatted;
  }
}

module.exports = new ChromaService();
