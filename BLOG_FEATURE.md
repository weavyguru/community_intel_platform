# Blog Creator Feature

The Blog Creator is an AI-powered tool that helps you create data-driven blog posts from community insights.

## Overview

The Blog Creator uses a multi-step workflow:

1. **Search & Discover**: Ask Claude to analyze community data from the last 90 days
2. **Topic Planning**: AI suggests 5 relevant blog topics with clear synopses and relevance reasoning
3. **Content Generation**: Select topics and generate full blog posts with AI-generated cover images
4. **Edit & Publish**: Review, edit, and publish to HubSpot in draft mode

## Features

- **AI-Powered Search**: Uses the same iterative search strategy as "Search and Ask" to find relevant community content
- **Smart Topic Suggestions**: Claude Sonnet 4.5 analyzes community data and suggests 5 blog topics with clear value propositions
- **Automated Content Creation**: Generates complete blog posts (800-1500 words) with proper HTML formatting
- **AI Cover Images**: Creates 5 unique header image variations using AI-selected icons and gradient backgrounds
- **WYSIWYG Editor**: Edit blog content with a simple visual editor
- **HubSpot Integration**: Publish directly to HubSpot as drafts (requires configuration)
- **Version Management**: Save multiple drafts and regenerate cover images

## Environment Variables

The blog creator uses the existing `CLAUDE_API_KEY` environment variable that's already configured in your platform.

To enable HubSpot publishing, add these variables to your `.env` file:

```env
# Claude API (Required - already configured)
CLAUDE_API_KEY=your_anthropic_api_key

# HubSpot Configuration (Optional - for blog publishing)
HUBSPOT_API_KEY=your_hubspot_private_app_token
HUBSPOT_BLOG_ID=your_blog_id
HUBSPOT_CONTENT_HUB_ID=your_content_hub_id  # Optional
```

### Getting HubSpot Credentials

1. **Create a HubSpot Private App:**
   - Go to HubSpot Settings → Integrations → Private Apps
   - Click "Create a private app"
   - Give it a name like "Community Intelligence Blog Publisher"
   - In the "Scopes" tab, select:
     - `cms.blog_posts.read`
     - `cms.blog_posts.write`
     - `content` (if using Content Hub)

2. **Get your Blog ID:**
   - Go to Marketing → Website → Blog
   - Click on your blog
   - The Blog ID is in the URL: `/blog/{BLOG_ID}/`

## How to Use

### 1. Navigate to Blog Creator
Click "Blog Creator" in the top navigation.

### 2. Generate Blog Topics
- Enter a query like "I want to create blog posts on what Lovable users are struggling with the most"
- Click "Generate Blog Topics"
- Claude will search the last 90 days of community data and suggest 5 relevant topics
- Watch the real-time status updates as it searches and analyzes

### 3. Select Topics
- Review the 5 suggested topics
- Each topic includes:
  - A compelling title
  - A brief synopsis (what the blog post will cover)
  - Why it's relevant (based on community data)
- Check the boxes next to topics you want to create
- Click "Generate Selected Blog Posts"

### 4. Review Generated Posts
- Each blog post includes:
  - 5 AI-generated cover image variations
  - Title and subtitle
  - Meta description (SEO)
  - URL-friendly slug
  - Full HTML-formatted body (800-1500 words)

### 5. Edit & Publish
- Click "Edit & Publish" on any blog post
- Select your preferred cover image (or regenerate new ones)
- Edit the title, subtitle, meta description, and slug
- Use the WYSIWYG editor to modify the body content
- Click "Save" to save your changes
- Click "Publish to HubSpot (Draft)" to publish to HubSpot

## Technical Architecture

### Models

**BlogTopic** (`src/models/BlogTopic.js`)
- Stores the search results and topic suggestions
- Tracks which topics have been selected and generated

**BlogPost** (`src/models/BlogPost.js`)
- Stores complete blog posts with all metadata
- Tracks cover images, publishing status, and HubSpot integration

### Services

**blogService** (`src/services/blogService.js`)
- `searchForBlogContent()` - Searches Chroma DB for last 90 days
- `generateBlogTopics()` - Uses Claude to suggest 5 topics
- `generateBlogPost()` - Creates complete blog post with cover images

**hubspotService** (`src/services/hubspotService.js`)
- `publishBlogPost()` - Publishes to HubSpot in draft mode
- `updateBlogPost()` - Updates existing HubSpot posts
- `deleteBlogPost()` - Removes posts from HubSpot

### Blog Image Creator

**Location**: `src/lib/blogImageCreator/`

The image creator generates 5 variations of header images (1024x512) with:
- AI-selected icons (Claude Haiku analyzes the topic and selects 3 relevant icons)
- Structured layout (large center icon, smaller side icons)
- Random backgrounds (5 gradient options)
- Subtle rotations for visual interest
- Watermark placement

### API Endpoints

#### Blog Creation Workflow
- `POST /api/blog/search-and-plan` - Search community data and generate topic suggestions
- `POST /api/blog/generate` - Generate full blog posts for selected topics

#### Blog Management
- `GET /api/blog/posts` - Get all blog posts (with filters)
- `GET /api/blog/posts/:id` - Get a single blog post
- `PUT /api/blog/posts/:id` - Update a blog post
- `DELETE /api/blog/posts/:id` - Delete a blog post

#### Publishing & Images
- `POST /api/blog/posts/:id/publish-hubspot` - Publish to HubSpot
- `POST /api/blog/posts/:id/regenerate-images` - Regenerate cover images

### Real-Time Updates

The Blog Creator uses Socket.IO for real-time status updates:
- `blog:status` - Search and topic generation progress
- `blog:generation` - Blog post generation progress

## AI Models Used

- **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`)
  - Search strategy planning
  - Topic suggestion generation
  - Blog content writing

- **Claude Haiku 3.5** (`claude-3-5-haiku-20241022`)
  - Icon selection for cover images
  - Quick evaluations

## Data Flow

1. **User Query** → Search Strategy (Sonnet 4.5)
2. **Search Strategy** → Iterative Chroma DB Searches (90-day window)
3. **Search Results** → Topic Generation (Sonnet 4.5) → 5 Topics
4. **Selected Topics** → Blog Post Generation:
   - Icon Selection (Haiku) → Cover Images
   - Content Writing (Sonnet 4.5) → HTML Body
5. **Generated Posts** → MongoDB Storage
6. **User Edits** → Update MongoDB
7. **Publish** → HubSpot API (Draft Mode)

## File Structure

```
src/
├── controllers/
│   └── blogController.js          # API endpoints
├── models/
│   ├── BlogTopic.js               # Topic suggestions
│   └── BlogPost.js                # Blog posts
├── services/
│   ├── blogService.js             # Core blog logic
│   └── hubspotService.js          # HubSpot integration
├── routes/
│   └── blog.js                    # Route definitions
├── lib/
│   └── blogImageCreator/
│       ├── generator.js           # Image generation
│       ├── iconSelector.js        # AI icon selection
│       └── assets/
│           ├── backgrounds/       # 5 gradient backgrounds
│           ├── icons/             # 4700+ SVG icons
│           ├── icon-bg.svg        # Icon background template
│           └── watermark.png      # Watermark
└── views/
    └── blog.ejs                   # Blog Creator UI

public/
└── js/
    └── blog.js                    # Client-side logic
```

## Assets

The blog image creator requires:
- **5 Background Images** (1024x512): `bg1.png` to `bg5.png` in `src/lib/blogImageCreator/assets/backgrounds/`
- **Icon Background SVG**: `icon-bg.svg` in `src/lib/blogImageCreator/assets/`
- **4700+ Icons**: SVG files in `src/lib/blogImageCreator/assets/icons/`
- **Watermark**: `watermark.png` in `src/lib/blogImageCreator/assets/`

These assets are copied from the `blog_image_creator` project.

## Dependencies

New packages added:
- `sharp` - High-performance image processing
- `@resvg/resvg-js` - SVG to PNG conversion
- `axios` - HTTP client for HubSpot API

## Limitations

- Searches only the last 90 days of community data
- Generates exactly 5 topic suggestions per query
- Cover images are 1024x512 (standard blog header size)
- HubSpot publishing requires configuration
- Published posts are created as DRAFTS in HubSpot (not immediately published)

## Future Enhancements

- [ ] Custom time windows for search
- [ ] More cover image customization options
- [ ] Bulk publishing to HubSpot
- [ ] SEO optimization suggestions
- [ ] Social media preview cards
- [ ] Export to Markdown/HTML
- [ ] Schedule publishing
- [ ] A/B testing for cover images
