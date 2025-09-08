import React, { useState } from 'react';
import ClaudeLogo from './ClaudeLogo';

const GitHubSetupPage = ({ setupInfo }) => {
  const [showEnvExample, setShowEnvExample] = useState(false);

  const generateSecret = () => {
    return [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <ClaudeLogo className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Claude Code UI Setup
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            GitHub OAuth configuration required to continue
          </p>
        </div>

        {/* Setup Steps */}
        <div className="space-y-6">
          {/* Step 1: GitHub OAuth App */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                1
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Create GitHub OAuth App
              </h2>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                First, you need to create a GitHub OAuth application to enable authentication.
              </p>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Required Settings:</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Application name:</span>
                    <code className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-xs">
                      Claude Code UI
                    </code>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Homepage URL:</span>
                    <code className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-xs">
                      http://localhost:3000
                    </code>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Authorization callback URL:</span>
                    <code className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-xs">
                      http://localhost:3001/api/auth/github/callback
                    </code>
                  </div>
                </div>
              </div>
              
              <a
                href="https://github.com/settings/applications/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                </svg>
                Create GitHub OAuth App
              </a>
            </div>
          </div>

          {/* Step 2: Environment Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                2
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Update Environment Variables
              </h2>
            </div>

            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                After creating your GitHub OAuth app, update your <code className="bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded text-sm">.env</code> file with the credentials.
              </p>

              {setupInfo?.missingVars && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <h3 className="font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                    Missing Environment Variables:
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {setupInfo.missingVars.map((varName) => (
                      <code key={varName} className="bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded text-sm">
                        {varName}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    Required .env configuration:
                  </h3>
                  <button
                    onClick={() => setShowEnvExample(!showEnvExample)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm"
                  >
                    {showEnvExample ? 'Hide' : 'Show'} Example
                  </button>
                </div>

                {showEnvExample && (
                  <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-100 font-mono overflow-x-auto">
                    <pre>{`# GitHub OAuth App credentials (required)
GITHUB_CLIENT_ID=your_client_id_from_github
GITHUB_CLIENT_SECRET=your_client_secret_from_github
GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/github/callback

# Token encryption (already configured)
GITHUB_TOKEN_SECRET=ybiQxw5icGfWsGIq0uXB/QVmeQQ7J1JAGrighAlZpxA=
JWT_SECRET=TuBeIQsneYlegCifgNF2rZPKipYe5/QcbAQ72ueLP2Q=
SESSION_SECRET=f1WRbMztvJkDoSz1mivctfYfx+WsgVr9SlAOkeGoBhk=

# Server Configuration
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:3000`}</pre>
                    <button
                      onClick={() => copyToClipboard(`# GitHub OAuth App credentials (required)
GITHUB_CLIENT_ID=your_client_id_from_github
GITHUB_CLIENT_SECRET=your_client_secret_from_github
GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/github/callback

# Token encryption (already configured)
GITHUB_TOKEN_SECRET=ybiQxw5icGfWsGIq0uXB/QVmeQQ7J1JAGrighAlZpxA=
JWT_SECRET=TuBeIQsneYlegCifgNF2rZPKipYe5/QcbAQ72ueLP2Q=
SESSION_SECRET=f1WRbMztvJkDoSz1mivctfYfx+WsgVr9SlAOkeGoBhk=

# Server Configuration
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:3000`)}
                      className="mt-2 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm">
                    <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                      Important Notes:
                    </h4>
                    <ul className="text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                      <li>Replace <code>your_client_id_from_github</code> and <code>your_client_secret_from_github</code> with actual values from your GitHub OAuth app</li>
                      <li>The encryption secrets have been auto-generated and are secure for development</li>
                      <li>Restart the server after updating the .env file</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Restart Server */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                3
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Restart the Server
              </h2>
            </div>

            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                After updating your .env file, restart the development server to apply the changes.
              </p>

              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm">
                    Run this command in your terminal:
                  </h3>
                  <button
                    onClick={() => copyToClipboard('npm run dev')}
                    className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <code className="text-sm text-gray-800 dark:text-gray-200 font-mono">
                  npm run dev
                </code>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm">
                    <h4 className="font-medium text-green-800 dark:text-green-300 mb-1">
                      After Setup Complete:
                    </h4>
                    <p className="text-green-700 dark:text-green-400">
                      You'll see the GitHub login page and can authenticate with your GitHub account to access your repositories.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Need help? Check the <a href="https://github.com/siteboon/claudecodeui" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">documentation</a> or create an <a href="https://github.com/siteboon/claudecodeui/issues" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">issue</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GitHubSetupPage;