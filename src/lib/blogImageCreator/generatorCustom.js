/**
 * Custom Blog Image Generator
 *
 * Layout: 3 icons of equal size arranged in pyramid pattern
 * - 1 icon centered on top
 * - 2 icons underneath, evenly spaced
 * - All icons same size, no rotation
 * - 100px padding from top and bottom
 * - Icons colored #fd6c38 (orange)
 *
 * Uses backgrounds from assets-custom/backgrounds/
 * Uses icons from assets/icons/ (same as original generator)
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { Resvg } = require('@resvg/resvg-js');
const { selectIconsForTopic } = require('./iconSelector');

// Configuration
const BG_WIDTH = 1024;
const BG_HEIGHT = 512;
const ICON_COLOR = '#fd6c38'; // Orange color for icons
const ICON_SIZE = 160; // Size of icons (same for all)
const TOP_PADDING = 80; // Distance from top edge
const BOTTOM_PADDING = 80; // Distance from bottom edge

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
 * Get custom backgrounds from assets-custom/backgrounds/
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
 * Get icons from the main assets/icons/ directory (shared with original generator)
 */
async function getIcons() {
    const iconsDir = path.join(__dirname, 'assets', 'icons');
    const files = await fs.readdir(iconsDir);
    return files
        .filter(f => f.endsWith('.svg'))
        .map(f => path.join(iconsDir, f));
}

/**
 * Convert SVG to colored PNG with specified color
 */
async function svgToColoredPng(svgPath, size, color = ICON_COLOR) {
    const svgContent = await fs.readFile(svgPath, 'utf-8');

    // Replace the fill color with our custom color
    const coloredSvg = svgContent.replace(/fill="currentColor"/g, `fill="${color}"`);

    // Render SVG to PNG using resvg
    const resvg = new Resvg(coloredSvg, {
        fitTo: {
            mode: 'width',
            value: size
        }
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return sharp(pngBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
}

/**
 * Generate a single blog image with custom layout
 * Layout: 1 icon on top (centered), 2 icons below (evenly spaced)
 */
async function generateImage(bgPath, outputPath, selectedIconPaths) {
    // Generate icon buffers (all same size, no rotation)
    const iconBuffers = [];

    for (const iconPath of selectedIconPaths) {
        const iconBuffer = await svgToColoredPng(iconPath, ICON_SIZE, ICON_COLOR);
        iconBuffers.push(iconBuffer);
    }

    // Calculate positions
    // Available height for icons (excluding padding)
    const availableHeight = BG_HEIGHT - TOP_PADDING - BOTTOM_PADDING;

    // Top icon: centered horizontally, 100px from top
    const topIconY = TOP_PADDING;
    const topIconX = Math.floor((BG_WIDTH - ICON_SIZE) / 2);

    // Bottom icons: 100px from bottom, spaced evenly
    // The two bottom icons should be symmetrically placed
    const bottomIconY = BG_HEIGHT - BOTTOM_PADDING - ICON_SIZE;
    const bottomSpacing = 120; // Horizontal distance from center to each bottom icon
    const bottomLeftX = Math.floor(BG_WIDTH / 2 - bottomSpacing - ICON_SIZE / 2);
    const bottomRightX = Math.floor(BG_WIDTH / 2 + bottomSpacing - ICON_SIZE / 2);

    const iconComposites = [
        // Icon 0: Top center
        {
            input: iconBuffers[0],
            top: topIconY,
            left: topIconX
        },
        // Icon 1: Bottom left
        {
            input: iconBuffers[1],
            top: bottomIconY,
            left: bottomLeftX
        },
        // Icon 2: Bottom right
        {
            input: iconBuffers[2],
            top: bottomIconY,
            left: bottomRightX
        }
    ];

    // Load watermark logo if exists
    const watermarkPath = path.join(__dirname, 'assets-custom', 'watermark.png');
    if (await fileExists(watermarkPath)) {
        const watermarkBuffer = await fs.readFile(watermarkPath);
        const watermarkMeta = await sharp(watermarkBuffer).metadata();

        // Add watermark to bottom right corner (24px from edges)
        iconComposites.push({
            input: watermarkBuffer,
            top: BG_HEIGHT - watermarkMeta.height - 24,
            left: BG_WIDTH - watermarkMeta.width - 24
        });
    }

    // Composite everything onto background
    await sharp(bgPath)
        .resize(BG_WIDTH, BG_HEIGHT, { fit: 'cover' })
        .composite(iconComposites)
        .toFile(outputPath);

    return outputPath;
}

/**
 * Generate blog cover images with custom template
 * Each variation gets fresh AI-selected icons for variety
 *
 * @param {string} topic - The blog topic
 * @param {number} count - Number of variations to generate (default 5)
 * @param {Array} selectedIconPaths - Initial icon paths (used for first variation, then fresh AI selection for rest)
 * @returns {Promise<Array>} Array of generated image info
 */
async function generateVariations(topic, count = 5, selectedIconPaths = null) {
    console.log(`[Custom Generator] Generating ${count} images for topic: ${topic}`);

    const backgrounds = await getBackgrounds();

    if (backgrounds.length === 0) {
        throw new Error('No backgrounds found in assets-custom/backgrounds/. Please add background images.');
    }

    // Output directory matches original generator
    const outputDir = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'blog-images');
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = Date.now();
    const results = [];

    for (let i = 0; i < count; i++) {
        // Randomly select a background for each variation
        const bgPath = backgrounds[Math.floor(Math.random() * backgrounds.length)];

        // Get AI-selected icons for each variation
        let variationIcons;
        if (i === 0 && selectedIconPaths && selectedIconPaths.length >= 3) {
            // Use pre-selected icons for first variation
            variationIcons = selectedIconPaths;
            console.log(`[Custom Generator] Variation ${i}: Using pre-selected icons`);
        } else {
            // Get fresh AI selection for remaining variations
            console.log(`[Custom Generator] Variation ${i}: Requesting AI icon selection...`);
            const iconSelection = await selectIconsForTopic(topic, null);
            variationIcons = iconSelection.iconPaths;
            console.log(`[Custom Generator] Variation ${i}: AI selected: ${iconSelection.iconNames.join(', ')}`);
        }

        const filename = `blog-${timestamp}-${i}.png`;
        const outputPath = path.join(outputDir, filename);

        await generateImage(bgPath, outputPath, variationIcons);

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
