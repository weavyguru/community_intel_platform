/**
 * Custom Blog Image Generator
 * Placeholder for alternate company image generation
 *
 * This generator uses a completely different template/layout
 * Assets are stored in ./assets-custom/
 *
 * To implement:
 * 1. Add backgrounds to assets-custom/backgrounds/
 * 2. Add icons to assets-custom/icons/
 * 3. Add watermark to assets-custom/watermark.png
 * 4. Implement the generateImages function with custom layout
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

// Custom configuration - adjust as needed
const BG_WIDTH = 1024;
const BG_HEIGHT = 512;

/**
 * Check if file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get custom backgrounds
 */
async function getBackgrounds() {
    const backgrounds = [];
    const bgDir = path.join(__dirname, 'assets-custom', 'backgrounds');

    try {
        const files = await fs.readdir(bgDir);
        for (const file of files) {
            if (file.endsWith('.png') || file.endsWith('.jpg')) {
                backgrounds.push(path.join(bgDir, file));
            }
        }
    } catch (error) {
        console.warn('No custom backgrounds found in assets-custom/backgrounds/');
    }

    return backgrounds;
}

/**
 * Get custom icons
 */
async function getIcons() {
    const iconsDir = path.join(__dirname, 'assets-custom', 'icons');

    try {
        const files = await fs.readdir(iconsDir);
        return files
            .filter(f => f.endsWith('.svg') || f.endsWith('.png'))
            .map(f => path.join(iconsDir, f));
    } catch (error) {
        console.warn('No custom icons found in assets-custom/icons/');
        return [];
    }
}

/**
 * Generate blog cover images with custom template
 * Signature matches original generator: (topic, count, selectedIconPaths)
 *
 * @param {string} topic - The blog topic
 * @param {number} count - Number of variations to generate (default 5)
 * @param {Array} selectedIconPaths - Array of icon paths (optional for custom)
 * @returns {Promise<Array>} Array of generated image info
 */
async function generateVariations(topic, count = 5, selectedIconPaths = null) {
    console.log(`[Custom Generator] Generating ${count} images for topic: ${topic}`);

    // Output directory matches original generator
    const outputDir = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'blog-images');
    await fs.mkdir(outputDir, { recursive: true });

    const backgrounds = await getBackgrounds();

    if (backgrounds.length === 0) {
        throw new Error('No backgrounds found in assets-custom/backgrounds/. Please add background images.');
    }

    const results = [];
    const timestamp = Date.now();

    for (let i = 0; i < count; i++) {
        const filename = `blog-${timestamp}-${i}.png`;
        const outputPath = path.join(outputDir, filename);

        // Select a random background
        const bgPath = backgrounds[Math.floor(Math.random() * backgrounds.length)];

        // TODO: Implement custom layout logic here
        // For now, just copy the background as a placeholder
        const bgImage = sharp(bgPath).resize(BG_WIDTH, BG_HEIGHT, { fit: 'cover' });

        // Add watermark if exists
        const watermarkPath = path.join(__dirname, 'assets-custom', 'watermark.png');
        if (await fileExists(watermarkPath)) {
            const watermark = await sharp(watermarkPath).toBuffer();
            await bgImage
                .composite([{
                    input: watermark,
                    gravity: 'southeast',
                    blend: 'over'
                }])
                .png()
                .toFile(outputPath);
        } else {
            await bgImage.png().toFile(outputPath);
        }

        results.push({
            filename,
            url: `/uploads/blog-images/${filename}`
        });
    }

    console.log(`[Custom Generator] Generated ${results.length} images`);
    return results;
}

module.exports = {
    generateVariations,
    getBackgrounds,
    getIcons
};
