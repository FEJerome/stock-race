#!/usr/bin/env node
/**
 * Session Cleanup Hook - Automatic cleanup of old session files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs as a standalone hook or can be called from session-end.js
 * Implements automatic cleanup based on age, count, and size limits
 */

const path = require('path');
const { runCleanup } = require('../lib/cleanup-utils');

async function main() {
  // Read configuration from environment variables or use defaults
  const config = {
    maxAgeDays: parseInt(process.env.CLAUDE_CLEANUP_MAX_AGE_DAYS) || 7,
    maxSessions: parseInt(process.env.CLAUDE_CLEANUP_MAX_SESSIONS) || 10,
    maxSizeMB: parseInt(process.env.CLAUDE_CLEANUP_MAX_SIZE_MB) || 50,
    verbose: process.env.CLAUDE_CLEANUP_VERBOSE === 'true' || false,
    enableCompression: process.env.CLAUDE_COMPRESSION_ENABLED === 'true' || false
  };

  // Check if cleanup is disabled
  if (process.env.CLAUDE_CLEANUP_ENABLED === 'false') {
    console.log('[SessionCleanup] Cleanup disabled by configuration');
    process.exit(0);
  }

  // Run cleanup with default sessions directory
  const results = runCleanup(undefined, config);

  // Log summary
  const totalDeleted = results.deletedByAge.length +
                      results.deletedByCount.length +
                      results.deletedBySize.length;

  if (totalDeleted > 0) {
    console.log(`[SessionCleanup] Cleanup completed: deleted ${totalDeleted} old session files`);
    console.log(`[SessionCleanup] Remaining: ${results.sessionCount - totalDeleted} sessions, ` +
                `${(results.directorySize / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`[SessionCleanup] No cleanup needed (${results.sessionCount} sessions)`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[SessionCleanup] Error:', err.message);
  process.exit(0);
});