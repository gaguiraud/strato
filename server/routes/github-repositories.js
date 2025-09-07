import express from 'express';
import { authenticateToken, getGitHubAccessToken } from '../middleware/github-auth.js';
import GitHubRepositoryService from '../services/github-repository-service.js';
import { githubUserDb } from '../database/github-db.js';

const router = express.Router();

// List user's repositories
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page, per_page, sort, type } = req.query;
    
    const result = await GitHubRepositoryService.listRepositories(req.user.userId, {
      page,
      per_page,
      sort,
      type
    });
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error listing repositories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search repositories
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q, page, per_page } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const result = await GitHubRepositoryService.searchRepositories(req.user.userId, q, {
      page,
      per_page
    });
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error searching repositories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get repository details
router.get('/:owner/:repo', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    
    const octokit = await GitHubRepositoryService.getOctokitForUser(req.user.userId);
    const { data } = await octokit.rest.repos.get({ owner, repo });
    
    const repository = GitHubRepositoryService.transformRepositoryData(data);
    res.json(repository);
  } catch (error) {
    console.error('❌ Error getting repository:', error);
    if (error.status === 404) {
      res.status(404).json({ error: 'Repository not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get repository contents (file tree)
router.get('/:owner/:repo/contents', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { path = '', ref } = req.query;
    
    let contents = await GitHubRepositoryService.getRepositoryContents(
      req.user.userId, 
      owner, 
      repo, 
      path
    );
    
    if (!contents) {
      return res.status(404).json({ error: 'Path not found' });
    }
    
    // If it's a single file, return file details
    if (!Array.isArray(contents)) {
      return res.json(contents);
    }
    
    // Filter and transform directory contents
    const files = contents
      .filter(item => 
        item.name !== 'node_modules' && 
        item.name !== 'dist' && 
        item.name !== 'build' &&
        item.name !== '.git'
      )
      .map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
        downloadUrl: item.download_url,
        htmlUrl: item.html_url
      }))
      .sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    
    res.json(files);
  } catch (error) {
    console.error('❌ Error getting repository contents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Read file content
router.get('/:owner/:repo/file', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { path, ref } = req.query;
    
    if (!path) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const fileData = await GitHubRepositoryService.readFile(
      req.user.userId,
      owner,
      repo,
      path,
      ref
    );
    
    res.json(fileData);
  } catch (error) {
    console.error('❌ Error reading file:', error);
    if (error.message.includes('not found') || error.message.includes('404')) {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Write/update file content
router.put('/:owner/:repo/file', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { path, content, message, branch, sha } = req.body;
    
    if (!path || content === undefined) {
      return res.status(400).json({ error: 'File path and content are required' });
    }
    
    const result = await GitHubRepositoryService.writeFile(
      req.user.userId,
      owner,
      repo,
      path,
      content,
      { message, branch, sha }
    );
    
    res.json({
      success: true,
      commit: result.commit,
      content: result.content
    });
  } catch (error) {
    console.error('❌ Error writing file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get repository branches
router.get('/:owner/:repo/branches', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    
    const branches = await GitHubRepositoryService.getBranches(
      req.user.userId,
      owner,
      repo
    );
    
    res.json({ branches });
  } catch (error) {
    console.error('❌ Error getting branches:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new branch
router.post('/:owner/:repo/branches', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { branchName, fromBranch } = req.body;
    
    if (!branchName) {
      return res.status(400).json({ error: 'Branch name is required' });
    }
    
    const result = await GitHubRepositoryService.createBranch(
      req.user.userId,
      owner,
      repo,
      branchName,
      fromBranch
    );
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error creating branch:', error);
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: 'Branch already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Create pull request
router.post('/:owner/:repo/pulls', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { title, body, head, base, draft } = req.body;
    
    if (!title || !head) {
      return res.status(400).json({ error: 'Title and head branch are required' });
    }
    
    const result = await GitHubRepositoryService.createPullRequest(
      req.user.userId,
      owner,
      repo,
      { title, body, head, base, draft }
    );
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error creating pull request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clone repository for local operations (creates a temporary workspace)
router.post('/:owner/:repo/workspace', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { branch = 'main' } = req.body;
    
    // This will be used for Claude CLI operations
    // We'll create a temporary workspace directory
    const workspaceId = `${owner}-${repo}-${Date.now()}`;
    const workspacePath = path.join(process.env.WORKSPACE_DIR || '/tmp/claude-workspaces', workspaceId);
    
    // Clone repository using git
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const execFile = promisify(spawn);
    
    const repository = await GitHubRepositoryService.listRepositories(req.user.userId, {
      useCache: true
    });
    
    const repoData = repository.repositories.find(r => r.fullName === `${owner}/${repo}`);
    if (!repoData) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Create workspace directory
    await fs.mkdir(workspacePath, { recursive: true });
    
    // Clone the repository
    const cloneProcess = spawn('git', [
      'clone',
      '--branch', branch,
      '--single-branch',
      repoData.cloneUrl,
      workspacePath
    ]);
    
    cloneProcess.on('close', (code) => {
      if (code === 0) {
        res.json({
          workspaceId,
          workspacePath,
          repository: repoData,
          branch
        });
      } else {
        res.status(500).json({ error: 'Failed to clone repository' });
      }
    });
    
    cloneProcess.on('error', (error) => {
      console.error('❌ Error cloning repository:', error);
      res.status(500).json({ error: 'Failed to clone repository' });
    });
    
  } catch (error) {
    console.error('❌ Error creating workspace:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up workspace
router.delete('/:owner/:repo/workspace/:workspaceId', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const workspacePath = path.join(process.env.WORKSPACE_DIR || '/tmp/claude-workspaces', workspaceId);
    
    // Remove workspace directory
    await fs.rm(workspacePath, { recursive: true, force: true });
    
    res.json({ success: true, message: 'Workspace cleaned up' });
  } catch (error) {
    console.error('❌ Error cleaning up workspace:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;