-- Initialize GitHub authentication database
PRAGMA foreign_keys = ON;

-- GitHub Users table for OAuth authentication
CREATE TABLE IF NOT EXISTS github_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id TEXT UNIQUE NOT NULL, -- GitHub user ID
    username TEXT NOT NULL, -- GitHub username
    display_name TEXT, -- GitHub display name
    email TEXT, -- Primary email from GitHub
    avatar_url TEXT, -- GitHub avatar URL
    github_access_token TEXT NOT NULL, -- Encrypted GitHub access token
    github_data TEXT, -- Additional GitHub user data as JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- Repository access cache (for performance)
CREATE TABLE IF NOT EXISTS repository_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    github_repo_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    private BOOLEAN DEFAULT 0,
    fork BOOLEAN DEFAULT 0,
    language TEXT,
    stargazers_count INTEGER DEFAULT 0,
    forks_count INTEGER DEFAULT 0,
    updated_at DATETIME,
    pushed_at DATETIME,
    default_branch TEXT DEFAULT 'main',
    clone_url TEXT,
    ssh_url TEXT,
    html_url TEXT,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES github_users (id) ON DELETE CASCADE
);

-- User sessions for tracking active repository work
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    repository_id INTEGER, -- Links to repository_cache
    session_type TEXT DEFAULT 'claude', -- 'claude', 'specstory', etc.
    branch_name TEXT,
    session_data TEXT, -- JSON data about the session
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES github_users (id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id) REFERENCES repository_cache (id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_github_users_github_id ON github_users(github_id);
CREATE INDEX IF NOT EXISTS idx_github_users_username ON github_users(username);
CREATE INDEX IF NOT EXISTS idx_github_users_active ON github_users(is_active);
CREATE INDEX IF NOT EXISTS idx_repository_cache_user_id ON repository_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_repository_cache_github_repo_id ON repository_cache(github_repo_id);
CREATE INDEX IF NOT EXISTS idx_repository_cache_full_name ON repository_cache(full_name);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_repository_id ON user_sessions(repository_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);