/**
 * Centralized branding configuration
 * All company-specific branding is controlled via environment variables
 */

module.exports = {
    // Company name displayed in UI
    companyName: process.env.COMPANY_NAME || 'Weavy Intelligence',

    // Team name used in AI prompts and agent instructions
    teamName: process.env.COMPANY_TEAM_NAME || 'Weavy team',

    // Email from address
    fromEmail: process.env.FROM_EMAIL || 'noreply@weavy.com',

    // Platform name for page titles
    platformName: process.env.COMPANY_NAME || 'Community Intelligence Platform'
};
