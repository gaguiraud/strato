import React, { createContext, useContext, useEffect, useState } from 'react';

const GitHubAuthContext = createContext({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
  error: null,
  repositories: [],
  fetchRepositories: () => {},
  isLoadingRepos: false,
  needsSetup: false,
  setupInfo: null
});

export const useGitHubAuth = () => {
  const context = useContext(GitHubAuthContext);
  if (!context) {
    throw new Error('useGitHubAuth must be used within a GitHubAuthProvider');
  }
  return context;
};

export const GitHubAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('auth-token'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupInfo, setSetupInfo] = useState(null);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Handle OAuth callback with token
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth_token');
    
    if (authToken) {
      setToken(authToken);
      localStorage.setItem('auth-token', authToken);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Fetch user info
      checkAuthStatus();
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // First, check if GitHub OAuth is configured
      const statusResponse = await fetch('/api/auth/status');
      const statusData = await statusResponse.json();
      
      if (statusData.needsSetup) {
        setNeedsSetup(true);
        setSetupInfo({
          missingVars: statusData.missingVars,
          error: statusData.error,
          message: statusData.message
        });
        setIsLoading(false);
        return;
      }
      
      // If GitHub is configured but we have a token, verify it
      if (token) {
        try {
          const userResponse = await authenticatedFetch('/api/auth/user');
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUser(userData.user);
            setNeedsSetup(false);
          } else {
            // Token is invalid
            localStorage.removeItem('auth-token');
            setToken(null);
            setUser(null);
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('auth-token');
          setToken(null);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      setError('Failed to check authentication status');
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    if (needsSetup) {
      setError('GitHub OAuth is not configured. Please follow the setup instructions.');
      return;
    }
    
    // Redirect to GitHub OAuth
    window.location.href = '/api/auth/github';
  };

  const logout = async () => {
    try {
      // Call logout endpoint
      if (token) {
        await authenticatedFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch (error) {
      console.error('Logout endpoint error:', error);
    } finally {
      // Clear local state regardless of API call result
      setToken(null);
      setUser(null);
      setRepositories([]);
      localStorage.removeItem('auth-token');
    }
  };

  const fetchRepositories = async (options = {}) => {
    if (!token) {
      console.warn('No token available for repository fetch');
      return;
    }

    if (needsSetup) {
      console.warn('GitHub OAuth not configured');
      return { repositories: [] };
    }

    try {
      setIsLoadingRepos(true);
      setError(null);

      const queryParams = new URLSearchParams({
        per_page: '50',
        sort: 'updated',
        type: 'all',
        ...options
      });

      const response = await authenticatedFetch(`/api/repositories?${queryParams}`);
      
      if (response.ok) {
        const data = await response.json();
        setRepositories(data.repositories || []);
        return data;
      } else {
        throw new Error('Failed to fetch repositories');
      }
    } catch (error) {
      console.error('Error fetching repositories:', error);
      setError('Failed to fetch repositories');
      return { repositories: [] };
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const searchRepositories = async (query, options = {}) => {
    if (!token || !query || needsSetup) {
      return { repositories: [] };
    }

    try {
      setIsLoadingRepos(true);
      setError(null);

      const queryParams = new URLSearchParams({
        q: query,
        per_page: '30',
        ...options
      });

      const response = await authenticatedFetch(`/api/repositories/search?${queryParams}`);
      
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        throw new Error('Failed to search repositories');
      }
    } catch (error) {
      console.error('Error searching repositories:', error);
      setError('Failed to search repositories');
      return { repositories: [] };
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Authenticated fetch utility
  const authenticatedFetch = (url, options = {}) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });
  };

  const value = {
    user,
    token,
    login,
    logout,
    isLoading,
    error,
    repositories,
    fetchRepositories,
    searchRepositories,
    isLoadingRepos,
    authenticatedFetch,
    needsSetup,
    setupInfo
  };

  return (
    <GitHubAuthContext.Provider value={value}>
      {children}
    </GitHubAuthContext.Provider>
  );
};

// Export the authenticatedFetch function for use in other components
export const useAuthenticatedFetch = () => {
  const { authenticatedFetch } = useGitHubAuth();
  return authenticatedFetch;
};