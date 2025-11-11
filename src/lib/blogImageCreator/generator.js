const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { Resvg } = require('@resvg/resvg-js');

// Configuration
const BG_WIDTH = 1024;
const BG_HEIGHT = 512;
const MAX_ROTATION = 10; // degrees

/**
 * Get all available background files
 */
async function getBackgrounds() {
    const backgrounds = [];
    const bgDir = path.join(__dirname, 'assets', 'backgrounds');
    for (let i = 1; i <= 5; i++) {
        const bgPath = path.join(bgDir, `bg${i}.png`);
        if (await fileExists(bgPath)) {
            backgrounds.push(bgPath);
        }
    }
    return backgrounds;
}

/**
 * Get all available icon files
 */
async function getIcons() {
    const iconsDir = path.join(__dirname, 'assets', 'icons');
    const files = await fs.readdir(iconsDir);
    return files
        .filter(f => f.endsWith('.svg'))
        .map(f => path.join(iconsDir, f));
}

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
 * Convert SVG to white-colored PNG
 */
async function svgToWhitePng(svgPath, size) {
    const svgContent = await fs.readFile(svgPath, 'utf-8');

    // Replace the fill color with white
    const whiteSvg = svgContent.replace(/fill="currentColor"/g, 'fill="#FFFFFF"');

    // Render SVG to PNG using resvg
    const resvg = new Resvg(whiteSvg, {
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
 * Create icon with background
 */
async function createIconWithBackground(iconPath, rotation, iconSize, iconBgSize) {
    const iconBgPath = path.join(__dirname, 'assets', 'icon-bg.svg');
    const iconBgSvg = await fs.readFile(iconBgPath, 'utf-8');

    // Render icon background
    const resvg = new Resvg(iconBgSvg, {
        fitTo: {
            mode: 'width',
            value: iconBgSize
        }
    });

    const bgPngData = resvg.render();
    const bgPngBuffer = bgPngData.asPng();

    // Get icon as white PNG
    const iconBuffer = await svgToWhitePng(iconPath, iconSize);

    // Get actual dimensions of the icon after SVG conversion
    const iconMeta = await sharp(iconBuffer).metadata();

    // Composite icon onto background FIRST (centered), THEN rotate the entire composite
    const centered = await sharp(bgPngBuffer)
        .resize(iconBgSize, iconBgSize)
        .composite([{
            input: iconBuffer,
            top: Math.floor((iconBgSize - iconMeta.height) / 2),
            left: Math.floor((iconBgSize - iconMeta.width) / 2)
        }])
        .toBuffer();

    // Now rotate the entire composited image (icon + background together)
    const rotated = await sharp(centered)
        .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

    return rotated;
}

/**
 * Generate a single blog image
 */
async function generateImage(bgPath, outputPath, selectedIconPaths) {
    // Generate icon composites with random rotation and INTENTIONAL size variation
    // First icon (index 0) will be CENTER - make it significantly larger
    // Other two icons (index 1,2) will be SIDES - make them smaller
    const iconData = [];

    for (let i = 0; i < selectedIconPaths.length; i++) {
        const iconPath = selectedIconPaths[i];

        // Random rotation for variety
        const rotation = Math.floor(Math.random() * (MAX_ROTATION * 2 + 1)) - MAX_ROTATION;

        // Size based on position: Center is larger, sides are small
        let iconSize, iconBgSize;
        if (i === 0) {
            // CENTER icon - prominent but not too large
            iconSize = Math.floor(Math.random() * 30 + 190); // 190-219px
            iconBgSize = Math.floor(Math.random() * 30 + 270); // 270-299px (around 290px)
        } else {
            // SIDE icons - keep same small size
            iconSize = Math.floor(Math.random() * 20 + 85); // 85-104px
            iconBgSize = Math.floor(Math.random() * 25 + 135); // 135-159px
        }

        // Create the icon with its background
        const iconBuffer = await createIconWithBackground(iconPath, rotation, iconSize, iconBgSize);

        // Get actual dimensions after rotation
        const meta = await sharp(iconBuffer).metadata();

        iconData.push({
            buffer: iconBuffer,
            size: Math.max(meta.width, meta.height),
            bgSize: iconBgSize,
            isCenter: i === 0
        });
    }

    // Structured positioning: Largest center, one on each side
    const centerX = BG_WIDTH / 2;
    const centerY = BG_HEIGHT / 2;
    const spacing = 240; // Horizontal distance from center to side icons

    const iconComposites = [
        // Icon 0 (LARGE CENTER): Perfect center
        {
            input: iconData[0].buffer,
            top: Math.floor(centerY - iconData[0].size / 2),
            left: Math.floor(centerX - iconData[0].size / 2)
        },
        // Icon 1 (small): Left of center
        {
            input: iconData[1].buffer,
            top: Math.floor(centerY - iconData[1].size / 2 + (Math.random() * 60 - 30)), // ±30px Y variation
            left: Math.floor(centerX - spacing - iconData[1].size / 2)
        },
        // Icon 2 (small): Right of center
        {
            input: iconData[2].buffer,
            top: Math.floor(centerY - iconData[2].size / 2 + (Math.random() * 60 - 30)), // ±30px Y variation
            left: Math.floor(centerX + spacing - iconData[2].size / 2)
        }
    ];

    // Load watermark logo if exists
    const watermarkPath = path.join(__dirname, 'assets', 'watermark.png');
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
        .composite(iconComposites)
        .toFile(outputPath);

    return outputPath;
}

/**
 * Generate multiple variations
 * Each variation uses a different background
 */
async function generateVariations(topic, count = 5, selectedIconPaths = null) {
    const backgrounds = await getBackgrounds();

    if (backgrounds.length === 0) {
        throw new Error('No background images found');
    }

    if (!selectedIconPaths || selectedIconPaths.length < 3) {
        throw new Error('Must provide exactly 3 icon paths');
    }

    const outputDir = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'blog-images');
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = Date.now();
    const results = [];

    for (let i = 0; i < count; i++) {
        // Randomly select a background for each variation
        const bgPath = backgrounds[Math.floor(Math.random() * backgrounds.length)];

        const filename = `blog-${timestamp}-${i}.png`;
        const outputPath = path.join(outputDir, filename);
        await generateImage(bgPath, outputPath, selectedIconPaths);
        results.push({
            filename,
            url: `/uploads/blog-images/${filename}`
        });
    }

    return results;
}

module.exports = {
    generateVariations,
    getIcons
};
