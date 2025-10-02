const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    let token = req.cookies?.token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      // If this is an API request, return JSON error
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Not authorized, no token' });
      }
      // For browser requests, redirect to login
      return res.redirect('/login');
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'User not found' });
      }
      return res.redirect('/login');
    }

    if (!req.user.isVerified) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Email not verified' });
      }
      return res.redirect('/login');
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not authorized, token failed' });
    }
    return res.redirect('/login');
  }
};

module.exports = auth;
