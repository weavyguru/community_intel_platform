const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://community_intel:CxMkyAjePhV0N58g@weavy.ydtz90f.mongodb.net/community_intel';
const newInstructions = fs.readFileSync('C:\\Projects\\community_intel_platform\\updated_agent_instructions.txt', 'utf8');

const client = new MongoClient(uri);

client.connect().then(async () => {
  const db = client.db('community_intel');

  // Get current config
  const oldConfig = await db.collection('agentconfigs').findOne({ type: 'create-tasks' });

  // Save version history
  await db.collection('agentconfigversions').insertOne({
    configId: oldConfig._id,
    type: oldConfig.type,
    version: oldConfig.currentVersion,
    instructions: oldConfig.instructions,
    valuePropositions: oldConfig.valuePropositions,
    searchFunctions: oldConfig.searchFunctions,
    notificationSettings: oldConfig.notificationSettings,
    createdAt: oldConfig.lastUpdated,
    createdBy: oldConfig.updatedBy,
    changeNotes: 'Lowered engagement threshold from 8+ to 6+ points and made scoring more generous to catch platform frustration posts'
  });

  // Update config
  const result = await db.collection('agentconfigs').updateOne(
    { type: 'create-tasks' },
    {
      $set: {
        instructions: newInstructions,
        currentVersion: oldConfig.currentVersion + 1,
        lastUpdated: new Date()
      }
    }
  );

  console.log('Updated agent config successfully');
  console.log('New version:', oldConfig.currentVersion + 1);
  console.log('Modified count:', result.modifiedCount);

  await client.close();
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
