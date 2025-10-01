# Community Intelligence Platform

A semantic search and AI-powered intelligence platform that monitors community activity across Discord, Reddit, X, and LinkedIn. The system uses Chroma vector database for semantic search and Claude 4.5 Sonnet for intelligent analysis, providing real-time insights and automated trend detection for the Weavy team.

## Features

- **Semantic Search**: Search community content using natural language queries
- **AI-Powered Analysis**: Ask Claude questions about community feedback with context
- **Automated Intelligence**: Hourly background job that monitors and creates actionable tasks
- **Task Management**: Track and complete tasks generated from community insights
- **Version Control**: Full version history for AI agent instructions with diff comparison
- **Email Notifications**: Automated alerts for high-priority items
- **User Management**: Admin panel for user and role management
- **Monaco Editor**: Rich Markdown editor for agent instruction configuration

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: EJS templates with Tailwind CSS and Shoelace Web Components
- **Database**: MongoDB (user management, tasks, configurations)
- **Vector DB**: Chroma (community content storage)
- **AI**: Claude 4.5 Sonnet API
- **Email**: SendGrid
- **Authentication**: JWT with email verification

## Prerequisites

- Node.js v16 or higher
- MongoDB Atlas account (or local MongoDB)
- Chroma API access
- Claude API key (Anthropic)
- SendGrid API key

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd community_intel_platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   The `.env` file is already configured with:
   - MongoDB Atlas connection
   - Chroma API credentials
   - Claude API key
   - SendGrid API key

   Update the following if needed:
   ```env
   SESSION_SECRET=your-session-secret-here
   JWT_SECRET=your-jwt-secret-here
   BASE_URL=http://localhost:3000
   ```

4. **Start the application**

   Development mode:
   ```bash
   npm run dev
   ```

   Production mode:
   ```bash
   npm start
   ```

5. **Access the application**

   Open your browser and navigate to `http://localhost:3000`

## First Time Setup

1. **Register an account**
   - Navigate to `/register`
   - Use a `@weavy.com` email address (domain restriction)
   - Check your email for verification link

2. **Verify your email**
   - Click the verification link in your email
   - You can now log in

3. **Promote to admin** (if needed)
   - Connect to MongoDB directly
   - Update your user document: `{ role: 'admin' }`

4. **Configure AI agents**
   - Navigate to Admin > Ask Agent Configuration
   - Review and customize the instructions
   - Navigate to Admin > Background Agent Configuration
   - Configure notification settings and keywords

## Project Structure

```
community_intel_platform/
├── src/
│   ├── config/              # Configuration files (DB, Chroma, Claude, SendGrid)
│   ├── models/              # MongoDB models
│   ├── controllers/         # Request handlers
│   ├── services/            # Business logic (Chroma, Claude, Email, Background Agent)
│   ├── middleware/          # Authentication and authorization
│   ├── routes/              # API and view routes
│   ├── views/               # EJS templates
│   └── jobs/                # Scheduled jobs
├── public/                  # Static assets (CSS, JS)
├── server.js                # Main application entry
├── package.json
└── .env                     # Environment variables
```

## Usage

### Search & Ask

1. **Semantic Search**
   - Enter a query in natural language
   - Filter by platform, date range, or author
   - View relevance scores and source metadata

2. **Ask Claude**
   - Ask questions about community feedback
   - Claude provides insights based on relevant content
   - Sources are automatically included

### Task Management

1. **View Tasks**
   - Filter by status, priority, platform
   - Mark tasks as complete
   - View source links and metadata

2. **Task Sources**
   - AI-generated tasks (from background agent)
   - High/medium/low priority classification
   - Platform and intent categorization

### Admin Functions

1. **User Management**
   - View all registered users
   - Change user roles (admin/user)
   - Monitor verification status

2. **Agent Configuration**
   - **Ask Agent**: Configure how Claude responds to user questions
   - **Background Agent**: Configure automated monitoring and task creation
   - Version control with full history
   - Compare versions side-by-side
   - Restore previous versions

3. **Manual Agent Execution**
   - Run background agent on-demand
   - View execution statistics
   - Test new configurations

## Background Intelligence Job

The background agent runs automatically every hour:

- Queries Chroma for new content from the last hour
- Analyzes content using Claude with configured instructions
- Creates tasks based on priority thresholds
- Sends email notifications for high-priority items
- Prevents duplicate task creation

### Configuring the Schedule

Edit `src/jobs/intelligenceJob.js`:

```javascript
// Hourly execution (production)
cron.schedule('0 * * * *', ...)

// Every 5 minutes (testing)
cron.schedule('*/5 * * * *', ...)
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/verify/:token` - Email verification
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password/:token` - Reset password
- `GET /api/auth/me` - Get current user

### Search & Intelligence
- `POST /api/search` - Semantic search
- `POST /api/ask` - Ask Claude with context
- `GET /api/search/filters` - Get available filters

### Tasks
- `GET /api/tasks` - Get all tasks (with filters)
- `GET /api/tasks/count` - Get uncompleted task count
- `PUT /api/tasks/:id/complete` - Mark task as complete
- `PUT /api/tasks/:id/reopen` - Reopen task

### Admin (requires admin role)
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id/role` - Update user role
- `GET /api/admin/agent-config/:type` - Get agent configuration
- `PUT /api/admin/agent-config/:type` - Update agent configuration
- `GET /api/admin/agent-config/:type/versions` - Get version history
- `POST /api/admin/agent-config/:type/restore/:versionNumber` - Restore version
- `POST /api/admin/agent/run` - Manually run background agent

## Security Features

- JWT authentication with httpOnly cookies
- Email verification required
- Domain restriction (@weavy.com only)
- Rate limiting on API endpoints
- Helmet.js security headers
- Input validation and sanitization
- CSRF protection via session tokens

## Email Notifications

Email notifications are sent for:
- User registration (verification link)
- Password reset requests
- High-priority tasks from background agent

Configure notification settings in the Background Agent admin panel:
- Enable/disable notifications
- Set minimum priority threshold
- Configure keywords to monitor
- Specify intent categories

## Troubleshooting

### MongoDB Connection Issues
- Verify MongoDB URI in `.env`
- Check network access in MongoDB Atlas
- Ensure IP whitelist includes your IP

### Chroma API Issues
- Verify Chroma API key and tenant ID
- Check Chroma host configuration
- Ensure collection exists or gets created

### SendGrid Email Issues
- Verify SendGrid API key
- Configure sender authentication in SendGrid
- Check email quota limits

### Claude API Issues
- Verify Claude API key
- Check API rate limits
- Monitor token usage in logs

## Development

### Adding New Features

1. Create models in `src/models/`
2. Add business logic in `src/services/`
3. Create controllers in `src/controllers/`
4. Define routes in `src/routes/`
5. Create views in `src/views/`

### Database Migrations

Connect to MongoDB and run migration scripts as needed:

```javascript
// Example: Add new field to all users
db.users.updateMany({}, { $set: { newField: defaultValue } })
```

## Production Deployment

1. **Environment Variables**
   - Set `NODE_ENV=production`
   - Generate strong secrets for JWT and session
   - Configure production MongoDB URI
   - Set `BASE_URL` to production domain

2. **Security**
   - Enable HTTPS/SSL
   - Configure CORS allowed origins
   - Set secure cookie flags
   - Review Helmet.js CSP policies

3. **Monitoring**
   - Use PM2 for process management
   - Set up error logging (Winston, Sentry)
   - Monitor background job execution
   - Track API usage and performance

4. **Backups**
   - Configure MongoDB automated backups
   - Export agent configuration versions
   - Backup environment variables securely

## License

Proprietary - Weavy Internal Use Only

## Support

For questions or issues, contact the Weavy development team.
