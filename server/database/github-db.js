import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = path.join(__dirname, 'github-auth.db');
const INIT_SQL_PATH = path.join(__dirname, 'github-init.sql');

// Create database connection
const db = new Database(DB_PATH);
console.log('✅ Connected to GitHub authentication database');

// Initialize database with schema
const initializeGitHubDatabase = async () => {
  try {
    const initSQL = fs.readFileSync(INIT_SQL_PATH, 'utf8');
    db.exec(initSQL);
    console.log('✅ GitHub database initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing GitHub database:', error.message);
    throw error;
  }
};

// GitHub User database operations
const githubUserDb = {
  // Create or update a user from GitHub OAuth
  createOrUpdateUser: async (userData) => {
    try {
      const {
        githubId,
        username,
        displayName,
        email,
        avatarUrl,
        githubAccessToken,
        githubData
      } = userData;
      
      // Check if user already exists
      const existingUser = db.prepare('SELECT * FROM github_users WHERE github_id = ?').get(githubId);
      
      if (existingUser) {
        // Update existing user
        const updateStmt = db.prepare(`
          UPDATE github_users 
          SET username = ?, display_name = ?, email = ?, avatar_url = ?, 
              github_access_token = ?, github_data = ?, last_login = CURRENT_TIMESTAMP
          WHERE github_id = ?
        `);
        
        updateStmt.run(
          username,
          displayName,
          email,
          avatarUrl,
          githubAccessToken,
          JSON.stringify(githubData),
          githubId
        );
        
        // Return updated user
        return db.prepare('SELECT * FROM github_users WHERE github_id = ?').get(githubId);
      } else {
        // Create new user
        const insertStmt = db.prepare(`
          INSERT INTO github_users (
            github_id, username, display_name, email, avatar_url, 
            github_access_token, github_data, created_at, last_login
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        
        const result = insertStmt.run(
          githubId,
          username,
          displayName,
          email,
          avatarUrl,
          githubAccessToken,
          JSON.stringify(githubData)
        );
        
        // Return newly created user
        return db.prepare('SELECT * FROM github_users WHERE id = ?').get(result.lastInsertRowid);
      }
    } catch (err) {
      console.error('❌ Error creating/updating GitHub user:', err);
      throw err;
    }
  },

  // Get user by internal ID
  getUserById: (userId) => {
    try {
      const user = db.prepare('SELECT * FROM github_users WHERE id = ? AND is_active = 1').get(userId);
      if (user && user.github_data) {
        try {
          user.githubData = JSON.parse(user.github_data);
        } catch (e) {
          user.githubData = {};
        }
      }
      return user;
    } catch (err) {
      console.error('❌ Error getting user by ID:', err);
      throw err;
    }
  },

  // Get user by GitHub ID
  getUserByGitHubId: (githubId) => {
    try {
      const user = db.prepare('SELECT * FROM github_users WHERE github_id = ? AND is_active = 1').get(githubId);
      if (user && user.github_data) {
        try {
          user.githubData = JSON.parse(user.github_data);
        } catch (e) {
          user.githubData = {};
        }
      }
      return user;
    } catch (err) {
      console.error('❌ Error getting user by GitHub ID:', err);
      throw err;
    }
  },

  // Get user by username
  getUserByUsername: (username) => {
    try {
      const user = db.prepare('SELECT * FROM github_users WHERE username = ? AND is_active = 1').get(username);
      if (user && user.github_data) {
        try {
          user.githubData = JSON.parse(user.github_data);
        } catch (e) {
          user.githubData = {};
        }
      }
      return user;
    } catch (err) {
      console.error('❌ Error getting user by username:', err);
      throw err;
    }
  },

  // Update last login time
  updateLastLogin: (userId) => {
    try {
      db.prepare('UPDATE github_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (err) {
      console.error('❌ Error updating last login:', err);
      throw err;
    }
  },

  // Update GitHub access token
  updateGitHubToken: (userId, encryptedToken) => {
    try {
      db.prepare('UPDATE github_users SET github_access_token = ? WHERE id = ?').run(encryptedToken, userId);
    } catch (err) {
      console.error('❌ Error updating GitHub token:', err);
      throw err;
    }
  },

  // Deactivate user
  deactivateUser: (userId) => {
    try {
      db.prepare('UPDATE github_users SET is_active = 0 WHERE id = ?').run(userId);
    } catch (err) {
      console.error('❌ Error deactivating user:', err);
      throw err;
    }
  },

  // Get all active users (for admin purposes)
  getAllUsers: () => {
    try {
      const users = db.prepare('SELECT id, github_id, username, display_name, email, avatar_url, created_at, last_login FROM github_users WHERE is_active = 1').all();
      return users;
    } catch (err) {
      console.error('❌ Error getting all users:', err);
      throw err;
    }
  },

  // Check if any users exist
  hasUsers: () => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM github_users WHERE is_active = 1').get();
      return row.count > 0;
    } catch (err) {
      console.error('❌ Error checking if users exist:', err);
      throw err;
    }
  }
};

export {
  db as githubDb,
  initializeGitHubDatabase,
  githubUserDb
};