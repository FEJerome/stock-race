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
  readSessionFile,
  extractSessionFromTranscript
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

        // If session data is empty, try to extract from transcript
        const transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
        if (transcriptPath && fs.existsSync(transcriptPath)) {
          if (!sessionData.context || sessionData.context === '' ||
              (sessionData.tasks && sessionData.tasks.length === 0) ||
              !sessionData.notes || sessionData.notes === '') {
            try {
              const extractedContent = extractSessionFromTranscript(transcriptPath);
              // Only update empty fields
              if (!sessionData.context || sessionData.context === '') {
                sessionData.context = extractedContent.context || '';
              }
              if (!sessionData.tasks || sessionData.tasks.length === 0) {
                sessionData.tasks = extractedContent.tasks || [];
              }
              if (!sessionData.notes || sessionData.notes === '') {
                sessionData.notes = extractedContent.notes || '';
              }
              if (!sessionData.files || sessionData.files.length === 0) {
                sessionData.files = extractedContent.files || [];
              }
              log(`[SessionEnd] Updated empty fields from transcript: ${transcriptPath}`);
            } catch (err) {
              log(`[SessionEnd] Failed to extract from transcript: ${err.message}`);
            }
          }
        }

        if (saveSessionAsJson(sessionFile, sessionData)) {
          log(`[SessionEnd] Updated JSON session file: ${sessionFile}`);
        }
      } else {
        // Convert legacy format to JSON if needed
        // Extract session content from transcript if available
        let extractedContent = { context: '', tasks: [], notes: '', files: [] };
        const transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
        if (transcriptPath && fs.existsSync(transcriptPath)) {
          try {
            extractedContent = extractSessionFromTranscript(transcriptPath);
            log(`[SessionEnd] Extracted session content from transcript: ${transcriptPath}`);
          } catch (err) {
            log(`[SessionEnd] Failed to extract from transcript: ${err.message}`);
          }
        }

        const sessionData = {
          date: today,
          started: currentTime,
          updated: currentTime,
          context: extractedContent.context || 'Converted from legacy format',
          tasks: extractedContent.tasks || [],
          notes: extractedContent.notes || '',
          files: extractedContent.files || []
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
      // Extract session content from transcript if available
      let extractedContent = { context: '', tasks: [], notes: '', files: [] };
      const transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
      if (transcriptPath && fs.existsSync(transcriptPath)) {
        try {
          extractedContent = extractSessionFromTranscript(transcriptPath);
          log(`[SessionEnd] Extracted session content from transcript: ${transcriptPath}`);
        } catch (err) {
          log(`[SessionEnd] Failed to extract from transcript: ${err.message}`);
        }
      }

      const sessionData = {
        date: today,
        started: currentTime,
        updated: currentTime,
        context: extractedContent.context || '',
        tasks: extractedContent.tasks || [],
        notes: extractedContent.notes || '',
        files: extractedContent.files || []
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