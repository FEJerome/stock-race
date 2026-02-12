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
  // Allow override via environment variable
  const envDir = process.env.CLAUDE_SESSIONS_DIR;
  if (envDir && envDir.trim()) {
    return envDir.trim();
  }
  return path.join(getClaudeDir(), 'sessions');
}

/**
 * Get the learned skills directory
 */
function getLearnedSkillsDir() {
  // Allow override via environment variable
  const envDir = process.env.CLAUDE_LEARNED_SKILLS_DIR;
  if (envDir && envDir.trim()) {
    return envDir.trim();
  }
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
 * Load configuration from JSON file
 * @param {string} configFile - Path to config file
 * @returns {object} Configuration object with defaults
 */
function loadConfig(configFile) {
  // Default configuration
  const defaultConfig = {
    min_session_length: 10,
    extraction_threshold: 'medium',
    auto_approve: false,
    learned_skills_path: '~/.claude/skills/learned/',
    patterns_to_detect: [
      'error_resolution',
      'user_corrections',
      'workarounds',
      'debugging_techniques',
      'project_specific'
    ],
    ignore_patterns: [
      'simple_typos',
      'one_time_fixes',
      'external_api_issues'
    ],
    project_specific_patterns: {}
  };

  const content = readFile(configFile);
  if (!content) {
    return defaultConfig;
  }

  try {
    const config = JSON.parse(content);
    // Merge with defaults
    return {
      ...defaultConfig,
      ...config,
      // Ensure arrays exist
      patterns_to_detect: config.patterns_to_detect || defaultConfig.patterns_to_detect,
      ignore_patterns: config.ignore_patterns || defaultConfig.ignore_patterns,
      project_specific_patterns: config.project_specific_patterns || defaultConfig.project_specific_patterns
    };
  } catch (err) {
    log(`[ConfigLoad] Error parsing config: ${err.message}`);
    return defaultConfig;
  }
}

/**
 * Create a pattern matcher function for given patterns
 * @param {Array<string>} patterns - List of pattern names to detect
 * @returns {function} Function that matches content against patterns
 */
function getPatternMatcher(patterns) {
  // Define pattern regexes for different pattern types
  const patternRegexes = {
    error_resolution: /(error|exception|fail|crash|bug).*(fix|resolve|solve|correct|patch)/i,
    user_corrections: /(wrong|incorrect|mistake|oops).*(correct|fix|update|change)/i,
    workarounds: /(workaround|temporary.*solution|bypass|alternative.*approach)/i,
    debugging_techniques: /(debug|troubleshoot|investigate).*(issue|problem|error)/i,
    project_specific: /(stock.*race|trading.*platform|ai.*decision|market.*data)/i,
    architecture_decisions: /(architecture|design.*pattern|system.*structure|module.*design)/i,
    tool_usage_patterns: /(claude.*code|hook|script|automation|configuration)/i,
    code_review_patterns: /(review.*code|refactor|optimize|improve.*performance)/i
  };

  return function(content) {
    const matches = [];
    for (const patternName of patterns) {
      const regex = patternRegexes[patternName];
      if (regex && regex.test(content)) {
        matches.push(patternName);
      }
    }
    return matches;
  };
}

/**
 * Detect patterns in content using provided pattern matcher
 * @param {string} content - Content to analyze
 * @param {Array<string>} patternsToDetect - List of pattern names to detect
 * @returns {object} Detection results with matched patterns and count
 */
function detectPatterns(content, patternsToDetect) {
  const matcher = getPatternMatcher(patternsToDetect);
  const matchedPatterns = matcher(content);

  return {
    matched_patterns: matchedPatterns,
    pattern_count: matchedPatterns.length,
    has_project_specific: matchedPatterns.includes('project_specific'),
    has_error_resolution: matchedPatterns.includes('error_resolution')
  };
}

/**
 * Get model-aware configuration based on context size and model type
 * @returns {object} Configuration object with cleanup and compact settings
 */
function getModelAwareConfig() {
  // Parse context size from environment variable (e.g., 128 for 128k)
  const contextSizeStr = process.env.CLAUDE_MODEL_CONTEXT_SIZE;
  let contextSize = null;
  if (contextSizeStr) {
    const match = contextSizeStr.match(/(\d+)/);
    if (match) {
      contextSize = parseInt(match[1], 10);
    }
  }

  // Get model type (deepseek, glm, kimi, opus, etc.)
  const modelType = process.env.CLAUDE_MODEL_TYPE ?
    process.env.CLAUDE_MODEL_TYPE.toLowerCase() : null;

  // Get optimization profile (aggressive, balanced, relaxed)
  const profile = process.env.CLAUDE_OPTIMIZATION_PROFILE || 'balanced';

  // Default configuration (balanced profile)
  let config = {
    cleanup: {
      maxAgeDays: 7,
      maxSessions: 10,
      maxSizeMB: 50,
      verbose: false
    },
    compact: {
      threshold: 50,
      checkInterval: 25,
      phaseAware: true,
      verbose: false
    },
    model: {
      contextSize,
      modelType,
      profile,
      description: 'Balanced optimization for general use'
    }
  };

  // Adjust based on context size if provided
  if (contextSize) {
    if (contextSize <= 128) {
      // DeepSeek 128k or similar small context
      config = {
        cleanup: {
          maxAgeDays: 3,
          maxSessions: 5,
          maxSizeMB: 20,
          verbose: false
        },
        compact: {
          threshold: 40,
          checkInterval: 20,
          phaseAware: true,
          verbose: false
        },
        model: {
          contextSize,
          modelType: modelType || 'deepseek',
          profile,
          description: 'Aggressive optimization for small context models (128k or less)'
        }
      };
    } else if (contextSize <= 160) {
      // Medium context (e.g., 150k)
      config = {
        cleanup: {
          maxAgeDays: 5,
          maxSessions: 8,
          maxSizeMB: 30,
          verbose: false
        },
        compact: {
          threshold: 45,
          checkInterval: 23,
          phaseAware: true,
          verbose: false
        },
        model: {
          contextSize,
          modelType: modelType || 'medium',
          profile,
          description: 'Moderate optimization for medium context models (129k-160k)'
        }
      };
    } else if (contextSize <= 200) {
      // GLM 4.7 200k, Opus 4.5 200k
      config = {
        cleanup: {
          maxAgeDays: 7,
          maxSessions: 12,
          maxSizeMB: 50,
          verbose: false
        },
        compact: {
          threshold: 50,
          checkInterval: 25,
          phaseAware: true,
          verbose: false
        },
        model: {
          contextSize,
          modelType: modelType || 'glm',
          profile,
          description: 'Standard optimization for 200k context models'
        }
      };
    } else if (contextSize <= 256) {
      // Kimi K2.5 256k or similar large context
      config = {
        cleanup: {
          maxAgeDays: 10,
          maxSessions: 15,
          maxSizeMB: 80,
          verbose: false
        },
        compact: {
          threshold: 60,
          checkInterval: 30,
          phaseAware: true,
          verbose: false
        },
        model: {
          contextSize,
          modelType: modelType || 'kimi',
          profile,
          description: 'Relaxed optimization for large context models (201k-256k)'
        }
      };
    } else {
      // Very large context (256k+)
      config = {
        cleanup: {
          maxAgeDays: 14,
          maxSessions: 20,
          maxSizeMB: 100,
          verbose: false
        },
        compact: {
          threshold: 70,
          checkInterval: 35,
          phaseAware: true,
          verbose: false
        },
        model: {
          contextSize,
          modelType: modelType || 'large',
          profile,
          description: 'Minimal optimization for very large context models (257k+)'
        }
      };
    }
  }

  // Override with specific model type if provided
  if (modelType) {
    const modelConfigs = {
      deepseek: {
        cleanup: { maxAgeDays: 3, maxSessions: 5, maxSizeMB: 20 },
        compact: { threshold: 40, checkInterval: 20 },
        description: 'Optimized for DeepSeek 128k context'
      },
      glm: {
        cleanup: { maxAgeDays: 7, maxSessions: 12, maxSizeMB: 50 },
        compact: { threshold: 50, checkInterval: 25 },
        description: 'Optimized for GLM models (200k context)'
      },
      kimi: {
        cleanup: { maxAgeDays: 10, maxSessions: 15, maxSizeMB: 80 },
        compact: { threshold: 60, checkInterval: 30 },
        description: 'Optimized for Kimi models (256k context)'
      },
      opus: {
        cleanup: { maxAgeDays: 7, maxSessions: 12, maxSizeMB: 50 },
        compact: { threshold: 50, checkInterval: 25 },
        description: 'Optimized for Claude Opus models (200k context)'
      },
      sonnet: {
        cleanup: { maxAgeDays: 7, maxSessions: 12, maxSizeMB: 50 },
        compact: { threshold: 50, checkInterval: 25 },
        description: 'Optimized for Claude Sonnet models'
      }
    };

    if (modelConfigs[modelType]) {
      const modelConfig = modelConfigs[modelType];
      config.cleanup = { ...config.cleanup, ...modelConfig.cleanup };
      config.compact = { ...config.compact, ...modelConfig.compact };
      config.model.description = modelConfig.description;
      config.model.modelType = modelType;
    }
  }

  // Apply optimization profile overrides
  const profileOverrides = {
    aggressive: {
      cleanup: { maxAgeDays: Math.max(1, Math.floor(config.cleanup.maxAgeDays * 0.5)),
                maxSessions: Math.max(3, Math.floor(config.cleanup.maxSessions * 0.5)),
                maxSizeMB: Math.max(10, Math.floor(config.cleanup.maxSizeMB * 0.4)) },
      compact: { threshold: Math.max(30, Math.floor(config.compact.threshold * 0.7)),
                checkInterval: Math.max(15, Math.floor(config.compact.checkInterval * 0.7)) },
      description: `${config.model.description} (aggressive profile)`
    },
    balanced: {
      // Use current config as-is for balanced profile
      description: config.model.description
    },
    relaxed: {
      cleanup: { maxAgeDays: Math.min(30, Math.floor(config.cleanup.maxAgeDays * 1.5)),
                maxSessions: Math.min(30, Math.floor(config.cleanup.maxSessions * 1.5)),
                maxSizeMB: Math.min(200, Math.floor(config.cleanup.maxSizeMB * 1.5)) },
      compact: { threshold: Math.min(100, Math.floor(config.compact.threshold * 1.3)),
                checkInterval: Math.min(50, Math.floor(config.compact.checkInterval * 1.3)) },
      description: `${config.model.description} (relaxed profile)`
    }
  };

  if (profileOverrides[profile]) {
    const profileConfig = profileOverrides[profile];
    config.cleanup = { ...config.cleanup, ...profileConfig.cleanup };
    config.compact = { ...config.compact, ...profileConfig.compact };
    config.model.description = profileConfig.description;
    config.model.profile = profile;
  }

  // Apply individual environment variable overrides (highest priority)
  if (process.env.CLAUDE_CLEANUP_MAX_AGE_DAYS) {
    config.cleanup.maxAgeDays = parseInt(process.env.CLAUDE_CLEANUP_MAX_AGE_DAYS);
  }
  if (process.env.CLAUDE_CLEANUP_MAX_SESSIONS) {
    config.cleanup.maxSessions = parseInt(process.env.CLAUDE_CLEANUP_MAX_SESSIONS);
  }
  if (process.env.CLAUDE_CLEANUP_MAX_SIZE_MB) {
    config.cleanup.maxSizeMB = parseInt(process.env.CLAUDE_CLEANUP_MAX_SIZE_MB);
  }
  if (process.env.CLAUDE_CLEANUP_VERBOSE) {
    config.cleanup.verbose = process.env.CLAUDE_CLEANUP_VERBOSE === 'true';
  }
  if (process.env.CLAUDE_COMPACT_THRESHOLD) {
    config.compact.threshold = parseInt(process.env.CLAUDE_COMPACT_THRESHOLD);
  }
  if (process.env.CLAUDE_COMPACT_CHECK_INTERVAL) {
    config.compact.checkInterval = parseInt(process.env.CLAUDE_COMPACT_CHECK_INTERVAL);
  }
  if (process.env.CLAUDE_COMPACT_PHASE_AWARE) {
    config.compact.phaseAware = process.env.CLAUDE_COMPACT_PHASE_AWARE !== 'false';
  }
  if (process.env.CLAUDE_COMPACT_VERBOSE) {
    config.compact.verbose = process.env.CLAUDE_COMPACT_VERBOSE === 'true';
  }

  return config;
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

  // Hook I/O
  readStdinJson,
  log,
  output,

  // System
  commandExists,
  runCommand,
  isGitRepo,
  getGitModifiedFiles,

  // Configuration and pattern detection
  loadConfig,
  getPatternMatcher,
  detectPatterns,
  getModelAwareConfig
};