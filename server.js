require('dotenv').config();

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const connectDB = require('./src/config/database');
const { initializeSendGrid } = require('./src/config/sendgrid');
const intelligenceJob = require('./src/jobs/intelligenceJob');

// Load version
const versionFile = path.join(__dirname, 'version.json');
const { version } = JSON.parse(fs.readFileSync(versionFile, 'utf8'));

// Import routes
const authRoutes = require('./src/routes/auth');
const searchRoutes = require('./src/routes/search');
const taskRoutes = require('./src/routes/tasks');
const adminRoutes = require('./src/routes/admin');

// Import middleware
const auth = require('./src/middleware/auth');

const app = express();

// Connect to database
connectDB();

// Initialize SendGrid
initializeSendGrid();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      upgradeInsecureRequests: []
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGIN
    : 'http://localhost:3000',
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 7 * 24 * 60 * 60 // 7 days
  }),
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// View engine setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', __dirname + '/src/views');
app.set('layout', 'layouts/main');
app.set('view cache', false); // Disable view caching for development

// Static files
app.use(express.static('public'));

// Make version available to all views
app.use((req, res, next) => {
  res.locals.version = version;
  next();
});

// API Routes (no layout)
app.use('/api/auth', authRoutes);
app.use('/api', searchRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/admin', adminRoutes);

// View Routes (with layout)
app.get('/', auth, async (req, res) => {
  try {
    const Task = require('./src/models/Task');
    const taskCount = await Task.countDocuments({ isCompleted: false });

    res.render('index', {
      title: 'Home - Community Intelligence',
      activePage: 'home',
      user: req.user,
      taskCount
    });
  } catch (error) {
    console.error('Home page error:', error);
    res.status(500).send('Server error');
  }
});

app.get('/tasks', auth, async (req, res) => {
  try {
    const Task = require('./src/models/Task');
    const taskCount = await Task.countDocuments({ isCompleted: false });

    res.render('tasks', {
      title: 'Tasks - Community Intelligence',
      activePage: 'tasks',
      user: req.user,
      taskCount
    });
  } catch (error) {
    console.error('Tasks page error:', error);
    res.status(500).send('Server error');
  }
});

app.get('/login', (req, res) => {
  res.render('login', { layout: false });
});

app.get('/register', (req, res) => {
  res.render('register', { layout: false });
});

// Admin routes
const adminAuth = require('./src/middleware/adminAuth');

app.get('/admin', auth, adminAuth, async (req, res) => {
  try {
    const Task = require('./src/models/Task');
    const taskCount = await Task.countDocuments({ isCompleted: false });

    res.redirect('/admin/users');
  } catch (error) {
    console.error('Admin page error:', error);
    res.status(500).send('Server error');
  }
});

app.get('/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const Task = require('./src/models/Task');
    const taskCount = await Task.countDocuments({ isCompleted: false });

    res.render('admin/users', {
      title: 'User Management - Admin',
      activePage: 'admin',
      user: req.user,
      taskCount
    });
  } catch (error) {
    console.error('Admin users page error:', error);
    res.status(500).send('Server error');
  }
});

app.get('/admin/ask-agent', auth, adminAuth, async (req, res) => {
  try {
    const Task = require('./src/models/Task');
    const taskCount = await Task.countDocuments({ isCompleted: false });

    res.render('admin/askAgent', {
      title: 'Ask Agent Configuration - Admin',
      activePage: 'admin',
      user: req.user,
      taskCount
    });
  } catch (error) {
    console.error('Admin ask agent page error:', error);
    res.status(500).send('Server error');
  }
});

app.get('/admin/bg-agent', auth, adminAuth, async (req, res) => {
  try {
    const Task = require('./src/models/Task');
    const taskCount = await Task.countDocuments({ isCompleted: false });

    res.render('admin/bgAgent', {
      title: 'Background Agent Configuration - Admin',
      activePage: 'admin',
      user: req.user,
      taskCount
    });
  } catch (error) {
    console.error('Admin bg agent page error:', error);
    res.status(500).send('Server error');
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Server error'
      : err.message
  });
});

// Start server
const PORT = process.env.PORT || 3002;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start intelligence job
  intelligenceJob.start();
  console.log('Intelligence job started');
});

// Initialize Socket.IO
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io available globally
global.io = io;

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  intelligenceJob.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  intelligenceJob.stop();
  process.exit(0);
});

module.exports = app;
