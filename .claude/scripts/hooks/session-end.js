#!/usr/bin/env node
/**
 * Stop Hook (Session End) - Persist learnings when session ends
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs when Claude session ends. Creates/updates session log file
 * with timestamp for continuity tracking.
 */

const path = require('path');
const fs = require('fs');
const {
  getSessionsDir,
  getDateString,
  getTimeString,
  getSessionIdShort,
  ensureDir,
  readFile,
  writeFile,
  replaceInFile,
  log,
  saveSessionAsJson,
  readSessionFile
} = require('../lib/utils');

// Optional: Import cleanup utilities
let cleanupUtils;
try {
  cleanupUtils = require('../lib/cleanup-utils');
} catch (err) {
  // Cleanup utilities might not exist yet (backward compatibility)
  cleanupUtils = null;
}

/**
 * Create legacy format session file (compact text format)
 * @param {string} sessionFile - File path
 * @param {string} today - Date string
 * @param {string} shortId - Session ID
 * @param {string} currentTime - Current time string
 */
function createLegacySession(sessionFile, today, shortId, currentTime) {
  const template = `# ${today}-${shortId}
Started: ${currentTime}
Updated: ${currentTime}
---
State: [brief context]
Tasks: [active tasks]
Next: [notes for next session]
Files: [relevant files]`;

  writeFile(sessionFile, template);
  log(`[SessionEnd] Created compact session file: ${sessionFile}`);
}

async function main() {
  const sessionsDir = getSessionsDir();
  const today = getDateString();
  const shortId = getSessionIdShort();
  // Include session ID in filename for unique per-session tracking
  const sessionFile = path.join(sessionsDir, `${today}-${shortId}-session.tmp`);

  ensureDir(sessionsDir);

  const currentTime = getTimeString();

  // Check if JSON format is enabled (via environment variable or config)
  const useJsonFormat = process.env.CLAUDE_SESSION_JSON === 'true';

  // If session file exists for today, update it
  if (fs.existsSync(sessionFile)) {
    if (useJsonFormat) {
      // For JSON format, read and update the timestamp
      const sessionData = readSessionFile(sessionFile);
      if (sessionData && sessionData.format === 'json') {
        sessionData.updated = currentTime;
        sessionData.timestamp = new Date().toISOString();

        if (saveSessionAsJson(sessionFile, sessionData)) {
          log(`[SessionEnd] Updated JSON session file: ${sessionFile}`);
        }
      } else {
        // Convert legacy format to JSON if needed
        const sessionData = {
          date: today,
          started: currentTime,
          updated: currentTime,
          context: 'Converted from legacy format',
          tasks: [],
          notes: '',
          files: []
        };

        if (saveSessionAsJson(sessionFile, sessionData)) {
          log(`[SessionEnd] Converted legacy to JSON: ${sessionFile}`);
        }
      }
    } else {
      // Legacy text format update
      const success = replaceInFile(
        sessionFile,
        /\*\*Last Updated:\*\*.*/,
        `**Last Updated:** ${currentTime}`
      );

      if (success) {
        log(`[SessionEnd] Updated session file: ${sessionFile}`);
      }
    }
  } else {
    // Create new session file
    if (useJsonFormat) {
      // JSON format
      const sessionData = {
        date: today,
        started: currentTime,
        updated: currentTime,
        context: '',
        tasks: [],
        notes: '',
        files: []
      };

      if (saveSessionAsJson(sessionFile, sessionData)) {
        log(`[SessionEnd] Created JSON session file: ${sessionFile}`);
      } else {
        // Fall back to legacy format
        createLegacySession(sessionFile, today, shortId, currentTime);
      }
    } else {
      // Legacy text format
      createLegacySession(sessionFile, today, shortId, currentTime);
    }
  }

  // Run automatic cleanup after saving session
  if (cleanupUtils) {
    try {
      // Read cleanup configuration from environment variables or use defaults
      const cleanupConfig = {
        maxAgeDays: parseInt(process.env.CLAUDE_CLEANUP_MAX_AGE_DAYS) || 7,
        maxSessions: parseInt(process.env.CLAUDE_CLEANUP_MAX_SESSIONS) || 10,
        maxSizeMB: parseInt(process.env.CLAUDE_CLEANUP_MAX_SIZE_MB) || 50,
        verbose: process.env.CLAUDE_CLEANUP_VERBOSE === 'true' || false,
        enabled: process.env.CLAUDE_CLEANUP_ENABLED !== 'false' // Enabled by default
      };

      if (cleanupConfig.enabled) {
        cleanupUtils.runCleanup(sessionsDir, cleanupConfig);
        log(`[SessionEnd] Cleanup executed with config: ${JSON.stringify(cleanupConfig)}`);
      } else {
        log('[SessionEnd] Cleanup disabled by configuration');
      }
    } catch (err) {
      // Don't fail session end if cleanup fails
      log(`[SessionEnd] Cleanup warning: ${err.message}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[SessionEnd] Error:', err.message);
  process.exit(0);
});