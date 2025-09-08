import jwt from 'jsonwebtoken';
import crypto from 'crypto-js';
import { githubUserDb } from '../database/github-db.js';

// Get JWT secret from environment or use default (for development)
const JWT_SECRET = process.env.JWT_SECRET || 'claude-ui-github-secret-change-in-production';

// Optional API key middleware (keeping for backward compatibility)
const validateApiKey = (req, res, next) => {
  // Skip API key validation if not configured
  if (!process.env.API_KEY) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// GitHub JWT authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists and is active
    const user = await githubUserDb.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }
    
    // Add user info to request
    req.user = {
      userId: user.id,
      username: user.username,
      githubId: user.githubId
    };
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Generate JWT token for GitHub authenticated users
const generateGitHubToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      username: user.username,
      githubId: user.githubId
    },
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

// WebSocket authentication function for GitHub users
const authenticateWebSocket = async (token) => {
  if (!token) {
    return null;
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists
    const user = await githubUserDb.getUserById(decoded.userId);
    if (!user) {
      return null;
    }
    
    return {
      userId: user.id,
      username: user.username,
      githubId: user.githubId
    };
  } catch (error) {
    console.error('WebSocket token verification error:', error);
    return null;
  }
};

// Middleware to get GitHub access token for API calls
const getGitHubAccessToken = async (req, res, next) => {
  try {
    const user = await githubUserDb.getUserById(req.user.userId);
    if (!user || !user.githubAccessToken) {
      return res.status(401).json({ error: 'GitHub access token not found' });
    }
    
    // Decrypt GitHub access token
    const accessToken = crypto.AES.decrypt(
      user.githubAccessToken,
      process.env.GITHUB_TOKEN_SECRET || 'default-encryption-key'
    ).toString(crypto.enc.Utf8);
    
    req.githubAccessToken = accessToken;
    next();
  } catch (error) {
    console.error('Error retrieving GitHub access token:', error);
    return res.status(500).json({ error: 'Failed to retrieve GitHub access token' });
  }
};

export {
  validateApiKey,
  authenticateToken,
  generateGitHubToken,
  authenticateWebSocket,
  getGitHubAccessToken,
  JWT_SECRET
};