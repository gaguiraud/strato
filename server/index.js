// Load environment variables from .env file
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log('PORT from env:', process.env.PORT);

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import { promises as fsPromises } from 'fs';
import { spawn } from 'child_process';
import os from 'os';
import pty from 'node-pty';
import fetch from 'node-fetch';
import mime from 'mime-types';

// GitHub integration imports
import { initializeGitHubDatabase } from './database/github-db.js';
import { validateApiKey, authenticateToken, authenticateWebSocket } from './middleware/github-auth.js';
import githubAuthRoutes from './routes/github-auth.js';
import githubRepositoryRoutes from './routes/github-repositories.js';
import GitHubRepositoryService from './services/github-repository-service.js';

// Legacy imports (for backward compatibility during transition)
import { spawnClaude, abortClaudeSession } from './claude-cli.js';
import { spawnCursor, abortCursorSession } from './cursor-cli.js';
import gitRoutes from './routes/git.js';
import mcpRoutes from './routes/mcp.js';
import cursorRoutes from './routes/cursor.js';
import taskmasterRoutes from './routes/taskmaster.js';
import mcpUtilsRoutes from './routes/mcp-utils.js';

const app = express();
const server = http.createServer(app);

// Session configuration for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'claude-ui-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Single WebSocket server that handles both paths
const wss = new WebSocketServer({
    server,
    verifyClient: (info) => {
        console.log('WebSocket connection attempt to:', info.req.url);

        // Extract token from query parameters or headers
        const url = new URL(info.req.url, 'http://localhost');
        const token = url.searchParams.get('token') ||
            info.req.headers.authorization?.split(' ')[1];

        // Verify token using GitHub auth
        const user = authenticateWebSocket(token);
        if (!user) {
            console.log('❌ WebSocket authentication failed');
            return false;
        }

        // Store user info in the request for later use
        info.req.user = user;
        console.log('✅ WebSocket authenticated for user:', user.username);
        return true;
    }
});

// Make WebSocket server available to routes
app.locals.wss = wss;

app.use(cors());
app.use(express.json());

// Optional API key validation (if configured)
app.use('/api', validateApiKey);

// GitHub Authentication routes (public)
app.use('/api/auth', githubAuthRoutes);

// GitHub Repository routes (protected)
app.use('/api/repositories', authenticateToken, githubRepositoryRoutes);

// Legacy routes (protected) - keeping for backward compatibility during transition
app.use('/api/git', authenticateToken, gitRoutes);
app.use('/api/mcp', authenticateToken, mcpRoutes);
app.use('/api/cursor', authenticateToken, cursorRoutes);
app.use('/api/taskmaster', authenticateToken, taskmasterRoutes);
app.use('/api/mcp-utils', authenticateToken, mcpUtilsRoutes);

// Static files served after API routes
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes (protected)
app.get('/api/config', authenticateToken, (req, res) => {
    const host = req.headers.host || `${req.hostname}:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'wss' : 'ws';

    console.log('Config API called - Returning host:', host, 'Protocol:', protocol);

    res.json({
        serverPort: PORT,
        wsUrl: `${protocol}://${host}`,
        authMethod: 'github'
    });
});

// Legacy project endpoints - now redirect to GitHub repositories
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        // Redirect to GitHub repositories endpoint
        const result = await GitHubRepositoryService.listRepositories(req.user.userId, {
            per_page: 50
        });
        
        // Transform for backward compatibility
        const projects = result.repositories.map(repo => ({
            name: repo.fullName.replace('/', '-'),
            displayName: repo.name,
            fullPath: repo.fullName,
            path: repo.fullName,
            sessions: [], // Will be populated by SpecStory integration
            sessionMeta: { total: 0, hasMore: false }
        }));
        
        res.json(projects);
    } catch (error) {
        console.error('❌ Error fetching projects:', error);
        res.status(500).json({ error: error.message });
    }
});

// File operations - now use GitHub API
app.get('/api/projects/:projectName/file', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { filePath } = req.query;

        console.log('📄 File read request:', projectName, filePath);

        // Parse GitHub repository from project name
        const [owner, repo] = projectName.replace(/-/g, '/').split('/');
        
        if (!owner || !repo) {
            return res.status(400).json({ error: 'Invalid project format' });
        }

        const fileData = await GitHubRepositoryService.readFile(
            req.user.userId,
            owner,
            repo,
            filePath
        );

        res.json({ 
            content: fileData.content, 
            path: filePath,
            sha: fileData.sha
        });
    } catch (error) {
        console.error('Error reading file:', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: 'File not found' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Save file - now use GitHub API
app.put('/api/projects/:projectName/file', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { filePath, content } = req.body;

        console.log('💾 File save request:', projectName, filePath);

        // Parse GitHub repository from project name
        const [owner, repo] = projectName.replace(/-/g, '/').split('/');
        
        if (!owner || !repo) {
            return res.status(400).json({ error: 'Invalid project format' });
        }

        const result = await GitHubRepositoryService.writeFile(
            req.user.userId,
            owner,
            repo,
            filePath,
            content,
            { message: `Update ${filePath} via Claude Code UI` }
        );

        res.json({
            success: true,
            path: filePath,
            message: 'File saved successfully',
            commit: result.commit
        });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).json({ error: error.message });
    }
});

// File tree - now use GitHub API
app.get('/api/projects/:projectName/files', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        
        // Parse GitHub repository from project name
        const [owner, repo] = projectName.replace(/-/g, '/').split('/');
        
        if (!owner || !repo) {
            return res.status(400).json({ error: 'Invalid project format' });
        }

        const files = await GitHubRepositoryService.getRepositoryContents(
            req.user.userId,
            owner,
            repo
        );
        
        res.json(files || []);
    } catch (error) {
        console.error('❌ File tree error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// WebSocket connection handler that routes based on URL path
wss.on('connection', (ws, request) => {
    const url = request.url;
    console.log('🔗 Client connected to:', url);

    // Parse URL to get pathname without query parameters
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname;

    if (pathname === '/shell') {
        handleShellConnection(ws);
    } else if (pathname === '/ws') {
        handleChatConnection(ws);
    } else {
        console.log('❌ Unknown WebSocket path:', pathname);
        ws.close();
    }
});

// Handle chat WebSocket connections
function handleChatConnection(ws) {
    console.log('💬 Chat WebSocket connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'claude-command') {
                console.log('💬 User message:', data.command || '[Continue/Resume]');
                console.log('📁 Repository:', data.options?.repository || 'Unknown');
                console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');
                
                // Modified to work with GitHub repositories
                await spawnClaudeWithGitHub(data.command, data.options, ws);
            } else if (data.type === 'cursor-command') {
                console.log('🖱️ Cursor message:', data.command || '[Continue/Resume]');
                console.log('📁 Repository:', data.options?.repository || 'Unknown');
                
                // Modified to work with GitHub repositories  
                await spawnCursorWithGitHub(data.command, data.options, ws);
            } else if (data.type === 'abort-session') {
                console.log('🛑 Abort session request:', data.sessionId);
                const provider = data.provider || 'claude';
                const success = provider === 'cursor' 
                    ? abortCursorSession(data.sessionId)
                    : abortClaudeSession(data.sessionId);
                ws.send(JSON.stringify({
                    type: 'session-aborted',
                    sessionId: data.sessionId,
                    provider,
                    success
                }));
            }
        } catch (error) {
            console.error('❌ Chat WebSocket error:', error.message);
            ws.send(JSON.stringify({
                type: 'error',
                error: error.message
            }));
        }
    });

    ws.on('close', () => {
        console.log('🔌 Chat client disconnected');
    });
}

// Modified Claude spawning for GitHub integration
async function spawnClaudeWithGitHub(command, options, ws) {
    // TODO: Integrate with SpecStory and GitHub workspace
    // For now, use legacy implementation
    return await spawnClaude(command, options, ws);
}

// Modified Cursor spawning for GitHub integration  
async function spawnCursorWithGitHub(command, options, ws) {
    // TODO: Integrate with SpecStory and GitHub workspace
    // For now, use legacy implementation
    return await spawnCursor(command, options, ws);
}

// Handle shell WebSocket connections (unchanged for now)
function handleShellConnection(ws) {
    console.log('🐚 Shell client connected');
    let shellProcess = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 Shell message received:', data.type);

            if (data.type === 'init') {
                // Initialize shell with repository context
                const repository = data.repository; // GitHub repository info
                const sessionId = data.sessionId;
                const hasSession = data.hasSession;
                const provider = data.provider || 'claude';
                const initialCommand = data.initialCommand;
                const isPlainShell = data.isPlainShell || (!!initialCommand && !hasSession) || provider === 'plain-shell';

                console.log('🚀 Starting shell for repository:', repository?.fullName || 'Unknown');
                console.log('📋 Session info:', hasSession ? `Resume session ${sessionId}` : (isPlainShell ? 'Plain shell mode' : 'New session'));

                // TODO: Create GitHub repository workspace for shell operations
                // For now, use current working directory
                const workingDir = process.cwd();

                // Send welcome message
                let welcomeMsg;
                if (isPlainShell) {
                    welcomeMsg = `\x1b[36mStarting terminal for repository: ${repository?.fullName || 'Unknown'}\x1b[0m\r\n`;
                } else {
                    const providerName = provider === 'cursor' ? 'Cursor' : 'Claude';
                    welcomeMsg = hasSession ?
                        `\x1b[36mResuming ${providerName} session ${sessionId} for: ${repository?.fullName || 'Unknown'}\x1b[0m\r\n` :
                        `\x1b[36mStarting new ${providerName} session for: ${repository?.fullName || 'Unknown'}\x1b[0m\r\n`;
                }

                ws.send(JSON.stringify({
                    type: 'output',
                    data: welcomeMsg
                }));

                // TODO: Implement GitHub repository shell integration
                // For now, proceed with standard shell
                
                try {
                    let shellCommand;
                    if (isPlainShell) {
                        if (os.platform() === 'win32') {
                            shellCommand = `Set-Location -Path "${workingDir}"; ${initialCommand}`;
                        } else {
                            shellCommand = `cd "${workingDir}" && ${initialCommand}`;
                        }
                    } else if (provider === 'cursor') {
                        if (os.platform() === 'win32') {
                            if (hasSession && sessionId) {
                                shellCommand = `Set-Location -Path "${workingDir}"; cursor-agent --resume="${sessionId}"`;
                            } else {
                                shellCommand = `Set-Location -Path "${workingDir}"; cursor-agent`;
                            }
                        } else {
                            if (hasSession && sessionId) {
                                shellCommand = `cd "${workingDir}" && cursor-agent --resume="${sessionId}"`;
                            } else {
                                shellCommand = `cd "${workingDir}" && cursor-agent`;
                            }
                        }
                    } else {
                        const command = initialCommand || 'claude';
                        if (os.platform() === 'win32') {
                            if (hasSession && sessionId) {
                                shellCommand = `Set-Location -Path "${workingDir}"; claude --resume ${sessionId}; if ($LASTEXITCODE -ne 0) { claude }`;
                            } else {
                                shellCommand = `Set-Location -Path "${workingDir}"; ${command}`;
                            }
                        } else {
                            if (hasSession && sessionId) {
                                shellCommand = `cd "${workingDir}" && claude --resume ${sessionId} || claude`;
                            } else {
                                shellCommand = `cd "${workingDir}" && ${command}`;
                            }
                        }
                    }

                    console.log('🔧 Executing shell command:', shellCommand);

                    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
                    const shellArgs = os.platform() === 'win32' ? ['-Command', shellCommand] : ['-c', shellCommand];

                    shellProcess = pty.spawn(shell, shellArgs, {
                        name: 'xterm-256color',
                        cols: 80,
                        rows: 24,
                        cwd: process.env.HOME || (os.platform() === 'win32' ? process.env.USERPROFILE : '/'),
                        env: {
                            ...process.env,
                            TERM: 'xterm-256color',
                            COLORTERM: 'truecolor',
                            FORCE_COLOR: '3',
                        }
                    });

                    console.log('🟢 Shell process started with PTY, PID:', shellProcess.pid);

                    shellProcess.onData((data) => {
                        if (ws.readyState === ws.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'output',
                                data: data
                            }));
                        }
                    });

                    shellProcess.onExit((exitCode) => {
                        console.log('🔚 Shell process exited with code:', exitCode.exitCode, 'signal:', exitCode.signal);
                        if (ws.readyState === ws.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'output',
                                data: `\r\n\x1b[33mProcess exited with code ${exitCode.exitCode}${exitCode.signal ? ` (${exitCode.signal})` : ''}\x1b[0m\r\n`
                            }));
                        }
                        shellProcess = null;
                    });

                } catch (spawnError) {
                    console.error('❌ Error spawning process:', spawnError);
                    ws.send(JSON.stringify({
                        type: 'output',
                        data: `\r\n\x1b[31mError: ${spawnError.message}\x1b[0m\r\n`
                    }));
                }

            } else if (data.type === 'input') {
                if (shellProcess && shellProcess.write) {
                    try {
                        shellProcess.write(data.data);
                    } catch (error) {
                        console.error('Error writing to shell:', error);
                    }
                }
            } else if (data.type === 'resize') {
                if (shellProcess && shellProcess.resize) {
                    console.log('Terminal resize requested:', data.cols, 'x', data.rows);
                    shellProcess.resize(data.cols, data.rows);
                }
            }
        } catch (error) {
            console.error('❌ Shell WebSocket error:', error.message);
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    type: 'output',
                    data: `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`
                }));
            }
        }
    });

    ws.on('close', () => {
        console.log('🔌 Shell client disconnected');
        if (shellProcess && shellProcess.kill) {
            console.log('🔴 Killing shell process:', shellProcess.pid);
            shellProcess.kill();
        }
    });

    ws.on('error', (error) => {
        console.error('❌ Shell WebSocket error:', error);
    });
}

// Legacy audio transcription endpoint
app.post('/api/transcribe', authenticateToken, async (req, res) => {
    try {
        const multer = (await import('multer')).default;
        const upload = multer({ storage: multer.memoryStorage() });

        upload.single('audio')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: 'Failed to process audio file' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No audio file provided' });
            }

            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.' });
            }

            try {
                const FormData = (await import('form-data')).default;
                const formData = new FormData();
                formData.append('file', req.file.buffer, {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype
                });
                formData.append('model', 'whisper-1');
                formData.append('response_format', 'json');
                formData.append('language', 'en');

                const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        ...formData.getHeaders()
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
                }

                const data = await response.json();
                let transcribedText = data.text || '';

                const mode = req.body.mode || 'default';

                if (!transcribedText) {
                    return res.json({ text: '' });
                }

                if (mode === 'default') {
                    return res.json({ text: transcribedText });
                }

                // Handle enhancement modes
                try {
                    const OpenAI = (await import('openai')).default;
                    const openai = new OpenAI({ apiKey });

                    let prompt, systemMessage, temperature = 0.7, maxTokens = 800;

                    switch (mode) {
                        case 'prompt':
                            systemMessage = 'You are an expert prompt engineer who creates clear, detailed, and effective prompts.';
                            prompt = `You are an expert prompt engineer. Transform the following rough instruction into a clear, detailed, and context-aware AI prompt.

Your enhanced prompt should:
1. Be specific and unambiguous
2. Include relevant context and constraints
3. Specify the desired output format
4. Use clear, actionable language
5. Include examples where helpful
6. Consider edge cases and potential ambiguities

Transform this rough instruction into a well-crafted prompt:
"${transcribedText}"

Enhanced prompt:`;
                            break;

                        case 'vibe':
                        case 'instructions':
                        case 'architect':
                            systemMessage = 'You are a helpful assistant that formats ideas into clear, actionable instructions for AI agents.';
                            temperature = 0.5;
                            prompt = `Transform the following idea into clear, well-structured instructions that an AI agent can easily understand and execute.

IMPORTANT RULES:
- Format as clear, step-by-step instructions
- Add reasonable implementation details based on common patterns
- Only include details directly related to what was asked
- Do NOT add features or functionality not mentioned
- Keep the original intent and scope intact
- Use clear, actionable language an agent can follow

Transform this idea into agent-friendly instructions:
"${transcribedText}"

Agent instructions:`;
                            break;

                        default:
                            break;
                    }

                    if (prompt) {
                        const completion = await openai.chat.completions.create({
                            model: 'gpt-4o-mini',
                            messages: [
                                { role: 'system', content: systemMessage },
                                { role: 'user', content: prompt }
                            ],
                            temperature: temperature,
                            max_tokens: maxTokens
                        });

                        transcribedText = completion.choices[0].message.content || transcribedText;
                    }

                } catch (gptError) {
                    console.error('GPT processing error:', gptError);
                }

                res.json({ text: transcribedText });

            } catch (error) {
                console.error('Transcription error:', error);
                res.status(500).json({ error: error.message });
            }
        });
    } catch (error) {
        console.error('Endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    // In development, redirect to Vite dev server
    res.redirect(`http://localhost:${process.env.VITE_PORT || 3001}`);
  }
});

const PORT = process.env.PORT || 3001;

// Initialize database and start server
async function startServer() {
    try {
        // Initialize GitHub authentication database
        await initializeGitHubDatabase();
        console.log('✅ GitHub database initialized');

        server.listen(PORT, '0.0.0.0', async () => {
            console.log(`🚀 Claude Code UI server running on http://0.0.0.0:${PORT}`);
            console.log('🔐 Using GitHub OAuth authentication');
            console.log('📁 Repository management via GitHub API');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();