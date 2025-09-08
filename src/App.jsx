/*
 * App.jsx - Main Application Component with GitHub Integration
 * 
 * GITHUB INTEGRATION OVERVIEW:
 * ============================
 * 
 * This application now uses GitHub OAuth for authentication and GitHub API for repository management.
 * Key changes from the previous filesystem-based approach:
 * 
 * 1. Authentication: GitHub OAuth replaces local SQLite authentication
 * 2. Project Management: GitHub repositories replace local filesystem projects
 * 3. File Operations: GitHub Contents API replaces direct filesystem operations
 * 4. Session Storage: SpecStory integration for Git-native chat history
 * 
 * How it works:
 * - Users authenticate with GitHub OAuth
 * - Select repositories to work with from their GitHub account
 * - Claude operations create branches and PRs automatically
 * - Chat history stored as markdown in .specstory/history/ directory
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import MobileNav from './components/MobileNav';
import ToolsSettings from './components/ToolsSettings';
import QuickSettingsPanel from './components/QuickSettingsPanel';
import GitHubLoginForm from './components/GitHubLoginForm';
import GitHubSetupPage from './components/GitHubSetupPage';

import { ThemeProvider } from './contexts/ThemeContext';
import { GitHubAuthProvider, useGitHubAuth } from './contexts/GitHubAuthContext';
import { TaskMasterProvider } from './contexts/TaskMasterContext';
import { TasksSettingsProvider } from './contexts/TasksSettingsContext';
import { WebSocketProvider, useWebSocketContext } from './contexts/WebSocketContext';
import { useVersionCheck } from './hooks/useVersionCheck';

// Protected Route component for GitHub authentication
const ProtectedRoute = ({ children }) => {
  const { user, isLoading, needsSetup, setupInfo } = useGitHubAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (needsSetup) {
    return <GitHubSetupPage setupInfo={setupInfo} />;
  }

  if (!user) {
    return <GitHubLoginForm />;
  }

  return children;
};

// Main App component with routing
function AppContent() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  
  const { updateAvailable, latestVersion, currentVersion } = useVersionCheck('siteboon', 'claudecodeui');
  const [showVersionModal, setShowVersionModal] = useState(false);
  
  const { user, repositories, fetchRepositories, isLoadingRepos } = useGitHubAuth();
  const [selectedRepository, setSelectedRepository] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'files'
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showToolsSettings, setShowToolsSettings] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [autoExpandTools, setAutoExpandTools] = useState(() => {
    const saved = localStorage.getItem('autoExpandTools');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [showRawParameters, setShowRawParameters] = useState(() => {
    const saved = localStorage.getItem('showRawParameters');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [autoScrollToBottom, setAutoScrollToBottom] = useState(() => {
    const saved = localStorage.getItem('autoScrollToBottom');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [sendByCtrlEnter, setSendByCtrlEnter] = useState(() => {
    const saved = localStorage.getItem('sendByCtrlEnter');
    return saved !== null ? JSON.parse(saved) : false;
  });
  
  // Session Protection System: Track sessions with active conversations
  const [activeSessions, setActiveSessions] = useState(new Set());
  
  const { ws, sendMessage, messages } = useWebSocketContext();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Fetch repositories when user is authenticated
    if (user) {
      fetchRepositories();
    }
  }, [user]);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      
      if (latestMessage.type === 'repository_updated') {
        // Handle repository updates (e.g., new branches, commits)
        console.log('Repository updated:', latestMessage);
        // Refresh repositories or update specific repository state
      }
    }
  }, [messages]);

  const handleRepositorySelect = (repository) => {
    setSelectedRepository(repository);
    setSelectedSession(null);
    navigate('/');
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleSessionSelect = (session) => {
    setSelectedSession(session);
    if (activeTab !== 'git' && activeTab !== 'preview') {
      setActiveTab('chat');
    }
    
    if (isMobile) {
      setSidebarOpen(false);
    }
    navigate(`/session/${session.id}`);
  };

  const handleNewSession = (project) => {
    setSelectedRepository(project.repository);
    setSelectedSession(null);
    setActiveTab('chat');
    navigate('/');
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleSessionDelete = (sessionId) => {
    if (selectedSession?.id === sessionId) {
      setSelectedSession(null);
      navigate('/');
    }
    // TODO: Implement SpecStory session deletion
  };

  const handleSidebarRefresh = async () => {
    // Refresh repositories
    if (user) {
      await fetchRepositories();
    }
  };

  // Session Protection Functions
  const markSessionAsActive = (sessionId) => {
    if (sessionId) {
      setActiveSessions(prev => new Set([...prev, sessionId]));
    }
  };

  const markSessionAsInactive = (sessionId) => {
    if (sessionId) {
      setActiveSessions(prev => {
        const newSet = new Set(prev);
        newSet.delete(sessionId);
        return newSet;
      });
    }
  };

  const replaceTemporarySession = (realSessionId) => {
    if (realSessionId) {
      setActiveSessions(prev => {
        const newSet = new Set();
        for (const sessionId of prev) {
          if (!sessionId.startsWith('new-session-')) {
            newSet.add(sessionId);
          }
        }
        newSet.add(realSessionId);
        return newSet;
      });
    }
  };

  // Transform repositories to match the old project structure for compatibility
  const projects = repositories.map(repo => ({
    name: repo.fullName.replace('/', '-'),
    displayName: repo.name,
    fullPath: repo.fullName,
    path: repo.fullName,
    repository: repo, // Add full repository data
    sessions: [], // TODO: Populate with SpecStory sessions
    sessionMeta: { total: 0, hasMore: false },
    // Additional GitHub-specific metadata
    githubData: {
      private: repo.private,
      fork: repo.fork,
      language: repo.language,
      stargazersCount: repo.stargazersCount,
      forksCount: repo.forksCount,
      updatedAt: repo.updatedAt,
      defaultBranch: repo.defaultBranch,
      htmlUrl: repo.htmlUrl
    }
  }));

  // Version Upgrade Modal Component
  const VersionUpgradeModal = () => {
    if (!showVersionModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowVersionModal(false)}
        />
        
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Update Available</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">A new version is ready</p>
              </div>
            </div>
            <button
              onClick={() => setShowVersionModal(false)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Version</span>
              <span className="text-sm text-gray-900 dark:text-white font-mono">{currentVersion}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Latest Version</span>
              <span className="text-sm text-blue-900 dark:text-blue-100 font-mono">{latestVersion}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">How to upgrade:</h3>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border">
              <code className="text-sm text-gray-800 dark:text-gray-200 font-mono">
                git checkout main && git pull && npm install
              </code>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Run this command in your Claude Code UI directory to update to the latest version.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowVersionModal(false)}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Later
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText('git checkout main && git pull && npm install');
                setShowVersionModal(false);
              }}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Copy Command
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex bg-background">
      {/* Fixed Desktop Sidebar */}
      {!isMobile && (
        <div className="w-80 flex-shrink-0 border-r border-border bg-card">
          <div className="h-full overflow-hidden">
            <Sidebar
              projects={projects}
              selectedProject={selectedRepository ? projects.find(p => p.repository.id === selectedRepository.id) : null}
              selectedSession={selectedSession}
              onProjectSelect={handleRepositorySelect}
              onSessionSelect={handleSessionSelect}
              onNewSession={handleNewSession}
              onSessionDelete={handleSessionDelete}
              onProjectDelete={() => {}} // TODO: Implement repository removal
              isLoading={isLoadingRepos}
              onRefresh={handleSidebarRefresh}
              onShowSettings={() => setShowToolsSettings(true)}
              updateAvailable={updateAvailable}
              latestVersion={latestVersion}
              currentVersion={currentVersion}
              onShowVersionModal={() => setShowVersionModal(true)}
            />
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && (
        <div className={`fixed inset-0 z-50 flex transition-all duration-150 ease-out ${
          sidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}>
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-150 ease-out"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(false);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSidebarOpen(false);
            }}
          />
          <div 
            className={`relative w-[85vw] max-w-sm sm:w-80 bg-card border-r border-border h-full transform transition-transform duration-150 ease-out ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Sidebar
              projects={projects}
              selectedProject={selectedRepository ? projects.find(p => p.repository.id === selectedRepository.id) : null}
              selectedSession={selectedSession}
              onProjectSelect={handleRepositorySelect}
              onSessionSelect={handleSessionSelect}
              onNewSession={handleNewSession}
              onSessionDelete={handleSessionDelete}
              onProjectDelete={() => {}} // TODO: Implement repository removal
              isLoading={isLoadingRepos}
              onRefresh={handleSidebarRefresh}
              onShowSettings={() => setShowToolsSettings(true)}
              updateAvailable={updateAvailable}
              latestVersion={latestVersion}
              currentVersion={currentVersion}
              onShowVersionModal={() => setShowVersionModal(true)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <MainContent
          selectedProject={selectedRepository ? projects.find(p => p.repository.id === selectedRepository.id) : null}
          selectedSession={selectedSession}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          ws={ws}
          sendMessage={sendMessage}
          messages={messages}
          isMobile={isMobile}
          onMenuClick={() => setSidebarOpen(true)}
          isLoading={isLoadingRepos}
          onInputFocusChange={setIsInputFocused}
          onSessionActive={markSessionAsActive}
          onSessionInactive={markSessionAsInactive}
          onReplaceTemporarySession={replaceTemporarySession}
          onNavigateToSession={(sessionId) => navigate(`/session/${sessionId}`)}
          onShowSettings={() => setShowToolsSettings(true)}
          autoExpandTools={autoExpandTools}
          showRawParameters={showRawParameters}
          autoScrollToBottom={autoScrollToBottom}
          sendByCtrlEnter={sendByCtrlEnter}
        />
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <MobileNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isInputFocused={isInputFocused}
        />
      )}

      {/* Quick Settings Panel */}
      {activeTab === 'chat' && (
        <QuickSettingsPanel
          isOpen={showQuickSettings}
          onToggle={setShowQuickSettings}
          autoExpandTools={autoExpandTools}
          onAutoExpandChange={(value) => {
            setAutoExpandTools(value);
            localStorage.setItem('autoExpandTools', JSON.stringify(value));
          }}
          showRawParameters={showRawParameters}
          onShowRawParametersChange={(value) => {
            setShowRawParameters(value);
            localStorage.setItem('showRawParameters', JSON.stringify(value));
          }}
          autoScrollToBottom={autoScrollToBottom}
          onAutoScrollChange={(value) => {
            setAutoScrollToBottom(value);
            localStorage.setItem('autoScrollToBottom', JSON.stringify(value));
          }}
          sendByCtrlEnter={sendByCtrlEnter}
          onSendByCtrlEnterChange={(value) => {
            setSendByCtrlEnter(value);
            localStorage.setItem('sendByCtrlEnter', JSON.stringify(value));
          }}
          isMobile={isMobile}
        />
      )}

      {/* Tools Settings Modal */}
      <ToolsSettings
        isOpen={showToolsSettings}
        onClose={() => setShowToolsSettings(false)}
        projects={projects}
      />

      {/* Version Upgrade Modal */}
      <VersionUpgradeModal />
    </div>
  );
}

// Root App component with router and providers
function App() {
  return (
    <ThemeProvider>
      <GitHubAuthProvider>
        <WebSocketProvider>
          <TasksSettingsProvider>
            <TaskMasterProvider>
              <ProtectedRoute>
                <Router>
                  <Routes>
                    <Route path="/" element={<AppContent />} />
                    <Route path="/session/:sessionId" element={<AppContent />} />
                  </Routes>
                </Router>
              </ProtectedRoute>
            </TaskMasterProvider>
          </TasksSettingsProvider>
        </WebSocketProvider>
      </GitHubAuthProvider>
    </ThemeProvider>
  );
}

export default App;