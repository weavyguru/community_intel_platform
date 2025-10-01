const { getChromaClient } = require('../config/chroma');

const COLLECTION_NAME = 'community_content';

class ChromaService {
  constructor() {
    this.client = null;
    this.collection = null;
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

      // If time filtering is needed, get more results and filter post-query
      const queryLimit = (filters.startDate || filters.endDate) ? limit * 3 : limit;

      const results = await this.collection.query({
        queryTexts: [query.toLowerCase()],
        nResults: queryLimit,
        where: Object.keys(where).length > 0 ? where : undefined
      });

      let formattedResults = this._formatResults(results);

      // Post-query time filtering if needed
      if (filters.startDate || filters.endDate) {
        formattedResults = formattedResults.filter(result => {
          if (!result.metadata?.timestamp) return true; // Keep if no timestamp

          const timestamp = new Date(result.metadata.timestamp);

          if (filters.startDate && timestamp < filters.startDate) return false;
          if (filters.endDate && timestamp > filters.endDate) return false;

          return true;
        });

        // Trim to requested limit after filtering
        formattedResults = formattedResults.slice(0, limit);
      }

      return formattedResults;
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

  async searchByTimeRange(startDate, endDate, limit = 50) {
    try {
      await this.initialize();

      const results = await this.collection.get({
        where: {
          timestamp: {
            $gte: startDate.toISOString(),
            $lte: endDate.toISOString()
          }
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
    try {
      await this.initialize();

      // Get a sample of documents to extract unique metadata values
      const results = await this.collection.get({
        limit: 1000
      });

      const platforms = new Set();
      const authors = new Set();
      const intents = new Set();

      results.metadatas.forEach(metadata => {
        if (metadata.platform) platforms.add(metadata.platform);
        if (metadata.author) authors.add(metadata.author);
        if (metadata.intent) intents.add(metadata.intent);
      });

      return {
        platforms: Array.from(platforms),
        authors: Array.from(authors),
        intents: Array.from(intents)
      };
    } catch (error) {
      console.error('Error getting metadata filters:', error);
      throw error;
    }
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
    const where = {};

    // Handle platforms array with $in operator (lowercase for case-insensitive matching)
    if (filters.platforms && filters.platforms.length > 0) {
      where.platform = { $in: filters.platforms.map(p => p.toLowerCase()) };
    }

    if (filters.author) {
      where.author = { $eq: filters.author };
    }

    if (filters.intent) {
      where.intent = { $eq: filters.intent };
    }

    // Handle is_comment filter based on includeComments
    if (filters.includeComments === false) {
      // Only posts (is_comment = false)
      where.is_comment = { $eq: false };
    } else if (filters.includeComments === true) {
      // Only comments (is_comment = true)
      where.is_comment = { $eq: true };
    }
    // If undefined, no filter - want everything

    // Note: Time-based filtering is done post-query in the results
    // because Chroma's where clause may not support complex timestamp queries
    // depending on the collection's metadata structure

    return where;
  }

  _formatResults(results) {
    if (!results.ids || results.ids.length === 0) {
      return [];
    }

    const formatted = [];
    for (let i = 0; i < results.ids[0].length; i++) {
      formatted.push({
        id: results.ids[0][i],
        content: results.documents[0][i],
        metadata: results.metadatas[0][i],
        distance: results.distances ? results.distances[0][i] : null,
        relevanceScore: results.distances ? (1 - results.distances[0][i]) : null
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
