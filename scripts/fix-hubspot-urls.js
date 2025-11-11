const mongoose = require('mongoose');
require('dotenv').config();

// Import BlogPost model
const BlogPost = require('../src/models/BlogPost');

async function fixHubSpotUrls() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all blog posts that have a HubSpot Post ID
        const posts = await BlogPost.find({
            hubSpotPostId: { $exists: true, $ne: null }
        });

        console.log(`Found ${posts.length} blog posts with HubSpot IDs`);

        let updatedCount = 0;

        for (const post of posts) {
            // Construct the new editor URL
            const newUrl = `https://app.hubspot.com/blog/462967/editor/${post.hubSpotPostId}/content`;

            // Update if different
            if (post.hubSpotUrl !== newUrl) {
                post.hubSpotUrl = newUrl;
                await post.save();
                updatedCount++;
                console.log(`Updated post "${post.title}" - ID: ${post.hubSpotPostId}`);
            }
        }

        console.log(`\nMigration complete! Updated ${updatedCount} blog posts.`);

        await mongoose.connection.close();
        console.log('Database connection closed');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run the migration
fixHubSpotUrls();
