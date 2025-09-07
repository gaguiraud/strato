import express from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import crypto from 'crypto-js';
import { Octokit } from '@octokit/rest';
import { githubUserDb } from '../database/github-db.js';
import { generateGitHubToken, authenticateToken } from '../middleware/github-auth.js';

const router = express.Router();

// GitHub OAuth Strategy Configuration
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL || "http://localhost:3001/api/auth/github/callback"
},
async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('📝 GitHub OAuth callback received for user:', profile.username);
    
    // Encrypt the access token for secure storage
    const encryptedToken = crypto.AES.encrypt(
      accessToken, 
      process.env.GITHUB_TOKEN_SECRET || 'default-encryption-key'
    ).toString();
    
    // Get additional user information from GitHub API
    const octokit = new Octokit({ auth: accessToken });
    const { data: githubUser } = await octokit.rest.users.getAuthenticated();
    const { data: emails } = await octokit.rest.users.listEmailsForAuthenticatedUser();
    
    const primaryEmail = emails.find(email => email.primary)?.email || githubUser.email;
    
    // Create or update user in our database
    const user = await githubUserDb.createOrUpdateUser({
      githubId: profile.id,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      email: primaryEmail,
      avatarUrl: githubUser.avatar_url,
      githubAccessToken: encryptedToken,
      githubData: {
        publicRepos: githubUser.public_repos,
        followers: githubUser.followers,
        following: githubUser.following,
        location: githubUser.location,
        company: githubUser.company,
        blog: githubUser.blog,
        bio: githubUser.bio
      }
    });
    
    return done(null, user);
  } catch (error) {
    console.error('❌ GitHub OAuth error:', error);
    return done(error, null);
  }
}));

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await githubUserDb.getUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Authentication status endpoint
router.get('/status', (req, res) => {
  res.json({ 
    needsSetup: false, // GitHub OAuth doesn't require setup
    isAuthenticated: !!req.user,
    authMethod: 'github'
  });
});

// Initiate GitHub OAuth
router.get('/github', passport.authenticate('github', { 
  scope: ['user:email', 'repo'] // Request access to user info and repositories
}));

// GitHub OAuth callback
router.get('/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login?error=github_auth_failed' }),
  async (req, res) => {
    try {
      // Generate our internal JWT token
      const token = generateGitHubToken(req.user);
      
      // Redirect to frontend with token
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      res.redirect(`${clientUrl}/?auth_token=${token}`);
    } catch (error) {
      console.error('❌ Token generation error:', error);
      res.redirect('/login?error=token_generation_failed');
    }
  }
);

// Get current user info (protected route)
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const user = await githubUserDb.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user data without sensitive information
    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        githubData: user.githubData
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Get user's GitHub repositories
router.get('/repositories', authenticateToken, async (req, res) => {
  try {
    const { page = 1, per_page = 30, sort = 'updated', type = 'all' } = req.query;
    
    const user = await githubUserDb.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Decrypt GitHub access token
    const accessToken = crypto.AES.decrypt(
      user.githubAccessToken,
      process.env.GITHUB_TOKEN_SECRET || 'default-encryption-key'
    ).toString(crypto.enc.Utf8);
    
    const octokit = new Octokit({ auth: accessToken });
    
    // Fetch user's repositories
    const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
      type, // 'all', 'owner', 'public', 'private', 'member'
      sort, // 'created', 'updated', 'pushed', 'full_name'
      per_page: parseInt(per_page),
      page: parseInt(page)
    });
    
    // Transform repository data for frontend
    const repositories = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      fork: repo.fork,
      language: repo.language,
      stargazersCount: repo.stargazers_count,
      forksCount: repo.forks_count,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      defaultBranch: repo.default_branch,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      html_url: repo.html_url
    }));
    
    res.json({
      repositories,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        has_more: repos.length === parseInt(per_page)
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Search repositories
router.get('/repositories/search', authenticateToken, async (req, res) => {
  try {
    const { q, page = 1, per_page = 30 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const user = await githubUserDb.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Decrypt GitHub access token
    const accessToken = crypto.AES.decrypt(
      user.githubAccessToken,
      process.env.GITHUB_TOKEN_SECRET || 'default-encryption-key'
    ).toString(crypto.enc.Utf8);
    
    const octokit = new Octokit({ auth: accessToken });
    
    // Search user's repositories
    const { data } = await octokit.rest.search.repos({
      q: `${q} user:${user.username}`,
      per_page: parseInt(per_page),
      page: parseInt(page)
    });
    
    const repositories = data.items.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      fork: repo.fork,
      language: repo.language,
      stargazersCount: repo.stargazers_count,
      forksCount: repo.forks_count,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      defaultBranch: repo.default_branch,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      html_url: repo.html_url
    }));
    
    res.json({
      repositories,
      total: data.total_count,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total_pages: Math.ceil(data.total_count / parseInt(per_page))
      }
    });
    
  } catch (error) {
    console.error('❌ Error searching repositories:', error);
    res.status(500).json({ error: 'Failed to search repositories' });
  }
});

export default router;