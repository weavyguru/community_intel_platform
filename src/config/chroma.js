const { ChromaClient } = require('chromadb');

let chromaClient = null;

const getChromaClient = async () => {
  if (chromaClient) {
    return chromaClient;
  }

  try {
    chromaClient = new ChromaClient({
      path: `https://${process.env.CHROMA_HOST}`,
      auth: {
        provider: 'token',
        credentials: process.env.CHROMA_API_KEY,
        tokenHeaderType: 'X_CHROMA_TOKEN'
      },
      tenant: process.env.CHROMA_TENANT,
      database: process.env.CHROMA_DATABASE
    });

    console.log('Chroma client initialized successfully');
    return chromaClient;
  } catch (error) {
    console.error('Error initializing Chroma client:', error.message);
    throw error;
  }
};

module.exports = { getChromaClient };
