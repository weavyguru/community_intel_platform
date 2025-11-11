const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

/**
 * Get all icon names (without .svg extension)
 */
async function getIconNames() {
    const iconsDir = path.join(__dirname, 'assets', 'icons');
    const files = await fs.readdir(iconsDir);
    return files
        .filter(f => f.endsWith('.svg'))
        .map(f => f.replace('.svg', ''));
}

/**
 * Select icons using Claude Haiku based on blog topic
 */
async function selectIconsForTopic(topic, anthropicClient) {
    try {
        const iconNames = await getIconNames();

        console.log(`Using Claude Haiku to select icons for topic: "${topic}"`);

        // Create Anthropic client directly with API key from env
        const client = new Anthropic({
            apiKey: process.env.CLAUDE_API_KEY
        });

        // Prepare icon list for Claude (compact format)
        const iconList = iconNames.join(', ');

        const prompt = `You are helping select icons for a blog post header image.

Topic: "${topic}"

Available icons (comma-separated): ${iconList}

Task: Select exactly 3 icons that are most relevant and visually representative of this blog topic.

IMPORTANT: You MUST choose icon names from the available icons list provided above. Use the EXACT names as they appear in the list (e.g., "flame" not "fire", "chart-line" not "chart", "dollar-sign" not "dollar").

Return your response as valid JSON only (no markdown, no code blocks):
{
  "icons": ["icon-name-1", "icon-name-2", "icon-name-3"],
  "reasoning": "Brief explanation (1-2 sentences) of why these specific icons were chosen for this topic"
}`;

        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 300,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        // Parse Claude's response
        const responseText = message.content[0].text;
        console.log('Claude response:', responseText);

        // Try to parse JSON from response
        let result;
        try {
            // Remove markdown code blocks if present
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            result = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('Failed to parse Claude response as JSON:', parseError);
            throw new Error('Invalid JSON response from Claude');
        }

        // Validate response format
        if (!result.icons || !Array.isArray(result.icons) || result.icons.length !== 3) {
            throw new Error('Invalid icon selection from Claude');
        }

        // Map icon names back to full paths
        const iconsDir = path.join(__dirname, 'assets', 'icons');
        const selectedPaths = [];
        const validIconNames = [];

        for (const iconName of result.icons) {
            const fullPath = path.join(iconsDir, `${iconName}.svg`);
            try {
                await fs.access(fullPath);
                selectedPaths.push(fullPath);
                validIconNames.push(iconName);
            } catch {
                console.warn(`Icon "${iconName}" not found in available icons`);
            }
        }

        // If we don't have enough valid icons, add random ones to reach 3
        if (selectedPaths.length < 3) {
            console.log(`Only ${selectedPaths.length} valid icons, adding random ones to reach 3`);
            const usedPaths = new Set(selectedPaths);

            while (selectedPaths.length < 3) {
                const randomIcon = iconNames[Math.floor(Math.random() * iconNames.length)];
                const randomPath = path.join(iconsDir, `${randomIcon}.svg`);
                if (!usedPaths.has(randomPath)) {
                    usedPaths.add(randomPath);
                    selectedPaths.push(randomPath);
                    validIconNames.push(randomIcon);
                }
            }
        }

        console.log(`Successfully selected ${selectedPaths.length} icons:`, validIconNames);

        return {
            iconPaths: selectedPaths,
            iconNames: validIconNames,
            reasoning: result.reasoning || 'Icons selected for relevance to the topic.',
            usedAI: true
        };

    } catch (error) {
        console.error('Error selecting icons with Claude:', error.message);
        console.log('Falling back to random icon selection');

        // Fallback to random selection
        const iconNames = await getIconNames();
        const iconsDir = path.join(__dirname, 'assets', 'icons');
        const numIcons = 3;
        const selectedPaths = [];
        const selectedNames = [];
        const usedIndices = new Set();

        while (selectedPaths.length < numIcons) {
            const idx = Math.floor(Math.random() * iconNames.length);
            if (!usedIndices.has(idx)) {
                usedIndices.add(idx);
                const iconName = iconNames[idx];
                selectedPaths.push(path.join(iconsDir, `${iconName}.svg`));
                selectedNames.push(iconName);
            }
        }

        return {
            iconPaths: selectedPaths,
            iconNames: selectedNames,
            reasoning: 'Icons were randomly selected due to an error with AI selection.',
            usedAI: false
        };
    }
}

module.exports = {
    selectIconsForTopic,
    getIconNames
};
