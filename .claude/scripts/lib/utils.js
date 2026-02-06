/**
 * Cross-platform utility functions for Claude Code hooks and scripts
 * Works on Windows, macOS, and Linux
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

// Platform detection
const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

/**
 * Get the user's home directory (cross-platform)
 */
function getHomeDir() {
  return os.homedir();
}

/**
 * Get the Claude config directory
 */
function getClaudeDir() {
  return path.join(getHomeDir(), '.claude');
}

/**
 * Get the sessions directory
 */
function getSessionsDir() {
  return path.join(getClaudeDir(), 'sessions');
}

/**
 * Get the learned skills directory
 */
function getLearnedSkillsDir() {
  return path.join(getClaudeDir(), 'skills', 'learned');
}

/**
 * Get the temp directory (cross-platform)
 */
function getTempDir() {
  return os.tmpdir();
}

/**
 * Ensure a directory exists (create if not)
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current time in HH:MM format
 */
function getTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Generate a short random string (6 characters)
 */
function generateShortId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Get short session ID from CLAUDE_SESSION_ID environment variable
 * Returns the last 8 characters for uniqueness with brevity
 * If no session ID is available, generates a unique ID with date and random string
 * @param {string} fallback - Fallback value if no session ID (default: 'default')
 */
function getSessionIdShort(fallback = 'default') {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId || sessionId.length === 0) {
    // If fallback is 'default' or not provided, generate a unique ID
    // Otherwise use the provided fallback value (for backward compatibility)
    if (fallback === 'default') {
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      const randomStr = generateShortId();
      return `${dateStr}-${randomStr}`;
    }
    return fallback;
  }
  return sessionId.slice(-8);
}

/**
 * Get current datetime in YYYY-MM-DD HH:MM:SS format
 */
function getDateTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Find files matching a pattern in a directory (cross-platform alternative to find)
 * @param {string} dir - Directory to search
 * @param {string} pattern - File pattern (e.g., "*.tmp", "*.md")
 * @param {object} options - Options { maxAge: days, recursive: boolean }
 */
function findFiles(dir, pattern, options = {}) {
  const { maxAge = null, recursive = false } = options;
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`);

  function searchDir(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isFile() && regex.test(entry.name)) {
          if (maxAge !== null) {
            const stats = fs.statSync(fullPath);
            const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (ageInDays <= maxAge) {
              results.push({ path: fullPath, mtime: stats.mtimeMs });
            }
          } else {
            const stats = fs.statSync(fullPath);
            results.push({ path: fullPath, mtime: stats.mtimeMs });
          }
        } else if (entry.isDirectory() && recursive) {
          searchDir(fullPath);
        }
      }
    } catch (err) {
      // Ignore permission errors
    }
  }

  searchDir(dir);

  // Sort by modification time (newest first)
  results.sort((a, b) => b.mtime - a.mtime);

  return results;
}

/**
 * Read JSON from stdin (for hook input)
 */
async function readStdinJson() {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      try {
        if (data.trim()) {
          resolve(JSON.parse(data));
        } else {
          resolve({});
        }
      } catch (err) {
        reject(err);
      }
    });

    process.stdin.on('error', reject);
  });
}

/**
 * Log to stderr (visible to user in Claude Code)
 */
function log(message) {
  console.error(message);
}

/**
 * Output to stdout (returned to Claude)
 */
function output(data) {
  if (typeof data === 'object') {
    console.log(JSON.stringify(data));
  } else {
    console.log(data);
  }
}

/**
 * Read a text file safely
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write a text file
 */
function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Append to a text file
 */
function appendFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, 'utf8');
}

/**
 * Check if a command exists in PATH
 * Uses execFileSync to prevent command injection
 */
function commandExists(cmd) {
  // Validate command name - only allow alphanumeric, dash, underscore, dot
  if (!/^[a-zA-Z0-9_.-]+$/.test(cmd)) {
    return false;
  }

  try {
    if (isWindows) {
      // Use spawnSync to avoid shell interpolation
      const result = spawnSync('where', [cmd], { stdio: 'pipe' });
      return result.status === 0;
    } else {
      const result = spawnSync('which', [cmd], { stdio: 'pipe' });
      return result.status === 0;
    }
  } catch {
    return false;
  }
}

/**
 * Run a command and return output
 *
 * SECURITY NOTE: This function executes shell commands. Only use with
 * trusted, hardcoded commands. Never pass user-controlled input directly.
 * For user input, use spawnSync with argument arrays instead.
 *
 * @param {string} cmd - Command to execute (should be trusted/hardcoded)
 * @param {object} options - execSync options
 */
function runCommand(cmd, options = {}) {
  try {
    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    return { success: false, output: err.stderr || err.message };
  }
}

/**
 * Check if current directory is a git repository
 */
function isGitRepo() {
  return runCommand('git rev-parse --git-dir').success;
}

/**
 * Get git modified files
 */
function getGitModifiedFiles(patterns = []) {
  if (!isGitRepo()) return [];

  const result = runCommand('git diff --name-only HEAD');
  if (!result.success) return [];

  let files = result.output.split('\n').filter(Boolean);

  if (patterns.length > 0) {
    files = files.filter(file => {
      return patterns.some(pattern => {
        const regex = new RegExp(pattern);
        return regex.test(file);
      });
    });
  }

  return files;
}

/**
 * Replace text in a file (cross-platform sed alternative)
 */
function replaceInFile(filePath, search, replace) {
  const content = readFile(filePath);
  if (content === null) return false;

  const newContent = content.replace(search, replace);
  writeFile(filePath, newContent);
  return true;
}

/**
 * Count occurrences of a pattern in a file
 */
function countInFile(filePath, pattern) {
  const content = readFile(filePath);
  if (content === null) return 0;

  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'g');
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Search for pattern in file and return matching lines with line numbers
 */
function grepFile(filePath, pattern) {
  const content = readFile(filePath);
  if (content === null) return [];

  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  const lines = content.split('\n');
  const results = [];

  lines.forEach((line, index) => {
    if (regex.test(line)) {
      results.push({ lineNumber: index + 1, content: line });
    }
  });

  return results;
}

/**
 * Generate session summary with compression for context reduction
 * @param {string} context - Session context/brief description
 * @param {Array<string>} tasks - Active tasks list
 * @param {string} notes - Notes for next session
 * @param {Array<string>} files - Relevant files list
 * @returns {object} Compressed session summary
 */
function generateSessionSummary(context, tasks, notes, files) {
  return {
    timestamp: new Date().toISOString(),
    context: context && context.length > 200 ? context.substring(0, 200) + '...' : context,
    tasks: Array.isArray(tasks) ? tasks.filter(t => t && t.trim()).slice(0, 10) : [],
    notes: notes && notes.length > 100 ? notes.substring(0, 100) + '...' : notes,
    files: Array.isArray(files) ? files.slice(0, 5) : []
  };
}

/**
 * Parse legacy session format (text/markdown)
 * @param {string} content - Legacy session content
 * @returns {object} Parsed session data
 */
function parseLegacySession(content) {
  const result = {
    version: 'legacy',
    date: null,
    started: null,
    updated: null,
    context: '',
    tasks: [],
    notes: '',
    files: []
  };

  try {
    const lines = content.split('\n');

    // Parse basic info from compact format
    if (content.includes('Started:')) {
      const startedMatch = content.match(/Started:\s*(.+)/);
      if (startedMatch) result.started = startedMatch[1].trim();

      const updatedMatch = content.match(/Updated:\s*(.+)/);
      if (updatedMatch) result.updated = updatedMatch[1].trim();

      const stateMatch = content.match(/State:\s*(.+)/);
      if (stateMatch) result.context = stateMatch[1].trim();

      const tasksMatch = content.match(/Tasks:\s*(.+)/);
      if (tasksMatch) {
        const tasksStr = tasksMatch[1].trim();
        if (tasksStr !== '[active tasks]') {
          // Simple parsing for task list
          result.tasks = tasksStr.split(',').map(t => t.trim()).filter(t => t);
        }
      }

      const notesMatch = content.match(/Next:\s*(.+)/);
      if (notesMatch) result.notes = notesMatch[1].trim();

      const filesMatch = content.match(/Files:\s*(.+)/);
      if (filesMatch) {
        const filesStr = filesMatch[1].trim();
        if (filesStr !== '[relevant files]') {
          result.files = filesStr.split(',').map(f => f.trim()).filter(f => f);
        }
      }

      // Try to extract date from filename or content
      const dateMatch = content.match(/# (\d{4}-\d{2}-\d{2})/);
      if (dateMatch) result.date = dateMatch[1];
    }
  } catch (err) {
    // Return minimal result on parse error
  }

  return result;
}

/**
 * Convert legacy session to JSON format
 * @param {string} legacyContent - Legacy session content
 * @returns {string} JSON formatted session
 */
function convertSessionToJson(legacyContent) {
  const parsed = parseLegacySession(legacyContent);
  const jsonData = {
    version: '2.0',
    format: 'json',
    date: parsed.date || new Date().toISOString().split('T')[0],
    started: parsed.started || new Date().toLocaleTimeString(),
    updated: parsed.updated || new Date().toLocaleTimeString(),
    context: parsed.context,
    tasks: parsed.tasks,
    notes: parsed.notes,
    files: parsed.files,
    compressed: true,
    originalFormat: 'legacy'
  };

  return JSON.stringify(jsonData, null, 2);
}

/**
 * Read session file with automatic format detection
 * @param {string} filePath - Path to session file
 * @returns {object} Session data object
 */
function readSessionFile(filePath) {
  const content = readFile(filePath);
  if (!content) return null;

  // Check if it's JSON format
  if (content.trim().startsWith('{')) {
    try {
      const jsonData = JSON.parse(content);
      // Ensure it has expected structure
      if (jsonData.version && jsonData.format === 'json') {
        return jsonData;
      }
    } catch (err) {
      // Not valid JSON, fall back to legacy format
    }
  }

  // Parse as legacy format
  return parseLegacySession(content);
}

/**
 * Extract session information from Claude Code transcript file
 * @param {string} transcriptPath - Path to transcript JSON file
 * @returns {object} Extracted session data (context, tasks, notes, files)
 */
function extractSessionFromTranscript(transcriptPath) {
  const result = {
    context: '',
    tasks: [],
    notes: '',
    files: []
  };

  try {
    const content = readFile(transcriptPath);
    if (!content) return result;

    const transcript = JSON.parse(content);
    const messages = transcript.messages || [];

    // Extract the last 3 messages for context
    const recentMessages = messages.slice(-6); // Last 3 exchanges (user+assistant pairs)
    const contextParts = [];

    for (const msg of recentMessages) {
      if (msg.type === 'user' || msg.type === 'assistant') {
        // Extract brief content (first 100 chars)
        const text = msg.content || '';
        const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;
        contextParts.push(`${msg.type}: ${preview}`);
      }
    }

    if (contextParts.length > 0) {
      result.context = contextParts.join(' | ');
    }

    // Extract tasks from assistant messages (looking for todo/task patterns)
    const taskPatterns = [
      /- \[ \]\s*(.+?)(?:\n|$)/g,  // - [ ] task
      /- \[x\]\s*(.+?)(?:\n|$)/gi, // - [x] task (completed)
      /TODO:\s*(.+?)(?:\n|$)/gi,   // TODO: task
      /Task:\s*(.+?)(?:\n|$)/gi,   // Task: task
      /1\.\s*(.+?)(?:\n|$)/g,      // 1. task
      /2\.\s*(.+?)(?:\n|$)/g,      // 2. task
      /\*\s*(.+?)(?:\n|$)/g        // * task
    ];

    const allTasks = new Set();
    for (const msg of messages) {
      if (msg.type === 'assistant') {
        const text = msg.content || '';
        for (const pattern of taskPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            if (match[1]) {
              const task = match[1].trim();
              if (task.length > 0 && task.length < 100) {
                allTasks.add(task);
              }
            }
          }
        }
      }
    }

    result.tasks = Array.from(allTasks).slice(0, 10); // Limit to 10 tasks

    // Extract notes (look for "note:", "notes:", "next session", etc.)
    const notePatterns = [
      /note:\s*(.+?)(?:\n|$)/gi,
      /notes:\s*(.+?)(?:\n|$)/gi,
      /next session:\s*(.+?)(?:\n|$)/gi,
      /next:\s*(.+?)(?:\n|$)/gi,
      /reminder:\s*(.+?)(?:\n|$)/gi
    ];

    for (const msg of messages.slice().reverse()) { // Search from most recent
      const text = msg.content || '';
      for (const pattern of notePatterns) {
        const match = text.match(pattern);
        if (match) {
          result.notes = match[0].substring(match[0].indexOf(':') + 1).trim();
          if (result.notes.length > 100) {
            result.notes = result.notes.substring(0, 100) + '...';
          }
          break;
        }
      }
      if (result.notes) break;
    }

    // Extract file paths from messages (simple pattern matching)
    const filePatterns = [
      /`([^`\n]+\.(js|ts|jsx|tsx|py|md|json|txt|yml|yaml))`/g,
      /"([^"\n]+\.(js|ts|jsx|tsx|py|md|json|txt|yml|yaml))"/g,
      /'([^'\n]+\.(js|ts|jsx|tsx|py|md|json|txt|yml|yaml))'/g,
      /([a-zA-Z]:\\[^:\n]*\.(js|ts|jsx|tsx|py|md|json|txt|yml|yaml))/g,
      /(\/[^:\n]*\.(js|ts|jsx|tsx|py|md|json|txt|yml|yaml))/g
    ];

    const allFiles = new Set();
    for (const msg of messages) {
      const text = msg.content || '';
      for (const pattern of filePatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          const filePath = match[1] || match[0];
          if (filePath && filePath.length > 0) {
            // Normalize path and get relative path if possible
            try {
              const normalized = path.normalize(filePath);
              allFiles.add(normalized);
            } catch {
              allFiles.add(filePath);
            }
          }
        }
      }
    }

    result.files = Array.from(allFiles).slice(0, 10); // Limit to 10 files

  } catch (err) {
    // If transcript parsing fails, return empty result
    log(`[TranscriptParse] Error: ${err.message}`);
  }

  return result;
}

/**
 * Save session in JSON format
 * @param {string} filePath - Path to save session file
 * @param {object} sessionData - Session data object
 * @returns {boolean} Success status
 */
function saveSessionAsJson(filePath, sessionData) {
  const jsonData = {
    version: '2.0',
    format: 'json',
    date: sessionData.date || new Date().toISOString().split('T')[0],
    started: sessionData.started || new Date().toLocaleTimeString(),
    updated: sessionData.updated || new Date().toLocaleTimeString(),
    context: sessionData.context || '',
    tasks: Array.isArray(sessionData.tasks) ? sessionData.tasks : [],
    notes: sessionData.notes || '',
    files: Array.isArray(sessionData.files) ? sessionData.files : [],
    compressed: true,
    timestamp: new Date().toISOString()
  };

  try {
    const jsonContent = JSON.stringify(jsonData, null, 2);
    writeFile(filePath, jsonContent);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  // Platform info
  isWindows,
  isMacOS,
  isLinux,

  // Directories
  getHomeDir,
  getClaudeDir,
  getSessionsDir,
  getLearnedSkillsDir,
  getTempDir,
  ensureDir,

  // Date/Time
  getDateString,
  getTimeString,
  getDateTimeString,
  getSessionIdShort,
  generateShortId,

  // File operations
  findFiles,
  readFile,
  writeFile,
  appendFile,
  replaceInFile,
  countInFile,
  grepFile,

  // Session compression
  generateSessionSummary,
  extractSessionFromTranscript,

  // Session format
  parseLegacySession,
  convertSessionToJson,
  readSessionFile,
  saveSessionAsJson,

  // Hook I/O
  readStdinJson,
  log,
  output,

  // System
  commandExists,
  runCommand,
  isGitRepo,
  getGitModifiedFiles
};