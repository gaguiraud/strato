import { Octokit } from '@octokit/rest';
import crypto from 'crypto-js';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { githubUserDb, githubDb } from '../database/github-db.js';

class GitHubRepositoryService {
  constructor() {
    this.repositoryCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
  }

  // Get authenticated Octokit instance for user
  async getOctokitForUser(userId) {
    const user = await githubUserDb.getUserById(userId);
    if (!user || !user.github_access_token) {
      throw new Error('User not found or GitHub access token missing');
    }

    // Decrypt GitHub access token
    const accessToken = crypto.AES.decrypt(
      user.github_access_token,
      process.env.GITHUB_TOKEN_SECRET || 'default-encryption-key'
    ).toString(crypto.enc.Utf8);

    return new Octokit({ auth: accessToken });
  }

  // List user's repositories with caching
  async listRepositories(userId, options = {}) {
    const { 
      page = 1, 
      per_page = 30, 
      sort = 'updated', 
      type = 'all',
      useCache = true 
    } = options;

    const cacheKey = `repos_${userId}_${type}_${sort}_${page}_${per_page}`;
    
    // Check cache first
    if (useCache && this.repositoryCache.has(cacheKey)) {
      const cached = this.repositoryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    try {
      const octokit = await this.getOctokitForUser(userId);
      
      const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
        type,
        sort,
        per_page: parseInt(per_page),
        page: parseInt(page)
      });

      const repositories = repos.map(repo => this.transformRepositoryData(repo));
      
      const result = {
        repositories,
        pagination: {
          page: parseInt(page),
          per_page: parseInt(per_page),
          has_more: repos.length === parseInt(per_page)
        }
      };

      // Cache the result
      if (useCache) {
        this.repositoryCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }

      // Update database cache
      await this.updateRepositoryCache(userId, repositories);

      return result;
    } catch (error) {
      console.error('❌ Error listing repositories:', error);
      throw new Error(`Failed to fetch repositories: ${error.message}`);
    }
  }

  // Search repositories
  async searchRepositories(userId, query, options = {}) {
    const { page = 1, per_page = 30 } = options;

    try {
      const octokit = await this.getOctokitForUser(userId);
      const user = await githubUserDb.getUserById(userId);

      const { data } = await octokit.rest.search.repos({
        q: `${query} user:${user.username}`,
        per_page: parseInt(per_page),
        page: parseInt(page)
      });

      const repositories = data.items.map(repo => this.transformRepositoryData(repo));

      return {
        repositories,
        total: data.total_count,
        pagination: {
          page: parseInt(page),
          per_page: parseInt(per_page),
          total_pages: Math.ceil(data.total_count / parseInt(per_page))
        }
      };
    } catch (error) {
      console.error('❌ Error searching repositories:', error);
      throw new Error(`Failed to search repositories: ${error.message}`);
    }
  }

  // Get repository contents
  async getRepositoryContents(userId, owner, repo, path = '') {
    try {
      const octokit = await this.getOctokitForUser(userId);

      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path
      });

      // Handle both single files and directory contents
      if (Array.isArray(data)) {
        // Directory contents
        return data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type, // 'file', 'dir', 'symlink', 'submodule'
          size: item.size,
          sha: item.sha,
          download_url: item.download_url,
          html_url: item.html_url
        }));
      } else {
        // Single file
        return {
          name: data.name,
          path: data.path,
          type: data.type,
          size: data.size,
          sha: data.sha,
          content: data.content,
          encoding: data.encoding,
          download_url: data.download_url,
          html_url: data.html_url
        };
      }
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      console.error('❌ Error getting repository contents:', error);
      throw new Error(`Failed to get repository contents: ${error.message}`);
    }
  }

  // Read file content from repository
  async readFile(userId, owner, repo, filePath, branch = null) {
    try {
      const octokit = await this.getOctokitForUser(userId);

      const params = {
        owner,
        repo,
        path: filePath
      };

      if (branch) {
        params.ref = branch;
      }

      const { data } = await octokit.rest.repos.getContent(params);

      if (data.type !== 'file') {
        throw new Error('Path is not a file');
      }

      // Decode base64 content
      const content = Buffer.from(data.content, 'base64').toString('utf8');

      return {
        content,
        path: filePath,
        sha: data.sha,
        size: data.size,
        encoding: data.encoding
      };
    } catch (error) {
      console.error('❌ Error reading file:', error);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  // Write file content to repository
  async writeFile(userId, owner, repo, filePath, content, options = {}) {
    try {
      const octokit = await this.getOctokitForUser(userId);
      const { message, branch, sha } = options;

      const params = {
        owner,
        repo,
        path: filePath,
        message: message || `Update ${filePath}`,
        content: Buffer.from(content, 'utf8').toString('base64')
      };

      if (branch) {
        params.branch = branch;
      }

      if (sha) {
        params.sha = sha; // For updating existing files
      }

      const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);

      return {
        commit: data.commit,
        content: data.content
      };
    } catch (error) {
      console.error('❌ Error writing file:', error);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  // Create a new branch
  async createBranch(userId, owner, repo, branchName, fromBranch = 'main') {
    try {
      const octokit = await this.getOctokitForUser(userId);

      // Get the SHA of the source branch
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${fromBranch}`
      });

      // Create new branch
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha
      });

      return {
        branch: branchName,
        sha: refData.object.sha,
        from: fromBranch
      };
    } catch (error) {
      console.error('❌ Error creating branch:', error);
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  // Create a pull request
  async createPullRequest(userId, owner, repo, options = {}) {
    try {
      const octokit = await this.getOctokitForUser(userId);
      const { 
        title, 
        body, 
        head, 
        base = 'main', 
        draft = false 
      } = options;

      const { data } = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
        draft
      });

      return {
        number: data.number,
        id: data.id,
        title: data.title,
        body: data.body,
        state: data.state,
        html_url: data.html_url,
        head: {
          ref: data.head.ref,
          sha: data.head.sha
        },
        base: {
          ref: data.base.ref,
          sha: data.base.sha
        }
      };
    } catch (error) {
      console.error('❌ Error creating pull request:', error);
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  // Get repository branches
  async getBranches(userId, owner, repo) {
    try {
      const octokit = await this.getOctokitForUser(userId);

      const { data } = await octokit.rest.repos.listBranches({
        owner,
        repo
      });

      return data.map(branch => ({
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected
      }));
    } catch (error) {
      console.error('❌ Error getting branches:', error);
      throw new Error(`Failed to get branches: ${error.message}`);
    }
  }

  // Transform GitHub API repository data for our frontend
  transformRepositoryData(repo) {
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      fork: repo.fork,
      language: repo.language,
      stargazersCount: repo.stargazers_count || 0,
      forksCount: repo.forks_count || 0,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      defaultBranch: repo.default_branch || 'main',
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      htmlUrl: repo.html_url,
      size: repo.size,
      topics: repo.topics || [],
      archived: repo.archived,
      disabled: repo.disabled
    };
  }

  // Update repository cache in database
  async updateRepositoryCache(userId, repositories) {
    try {
      const stmt = githubDb.prepare(`
        INSERT OR REPLACE INTO repository_cache (
          user_id, github_repo_id, full_name, name, description, private, fork,
          language, stargazers_count, forks_count, updated_at, pushed_at,
          default_branch, clone_url, ssh_url, html_url, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      for (const repo of repositories) {
        stmt.run(
          userId,
          repo.id,
          repo.fullName,
          repo.name,
          repo.description,
          repo.private ? 1 : 0,
          repo.fork ? 1 : 0,
          repo.language,
          repo.stargazersCount,
          repo.forksCount,
          repo.updatedAt,
          repo.pushedAt,
          repo.defaultBranch,
          repo.cloneUrl,
          repo.sshUrl,
          repo.htmlUrl
        );
      }
    } catch (error) {
      console.error('❌ Error updating repository cache:', error);
    }
  }

  // Clear cache for user
  clearCacheForUser(userId) {
    const keysToDelete = [];
    for (const key of this.repositoryCache.keys()) {
      if (key.startsWith(`repos_${userId}_`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.repositoryCache.delete(key));
  }
}

// Export singleton instance
export default new GitHubRepositoryService();