/**
 * Cleanup utilities for session file management
 * Cross-platform (Windows, macOS, Linux)
 */

const fs = require('fs');
const path = require('path');

// Import utility functions
const {
  getSessionsDir,
  findFiles,
  log
} = require('./utils');

/**
 * Default cleanup configuration
 */
const DEFAULT_CLEANUP_CONFIG = {
  maxAgeDays: 7,      // Keep sessions from last 7 days
  maxSessions: 10,    // Keep maximum 10 sessions
  maxSizeMB: 50,      // Maximum directory size in MB
  enableCompression: false, // Not implemented yet
  verbose: false      // Log verbose information
};

/**
 * Find all session files in sessions directory
 * @param {string} sessionsDir - Path to sessions directory
 * @returns {Array} Array of session file objects with metadata
 */
function findSessionFiles(sessionsDir) {
  const files = findFiles(sessionsDir, '*.tmp');

  return files.map(file => {
    const stats = fs.statSync(file.path);
    const filename = path.basename(file.path);

    // Parse date from filename: YYYY-MM-DD-*
    let date = null;
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      date = new Date(dateMatch[1]);
    }

    return {
      path: file.path,
      filename,
      size: stats.size,
      modified: stats.mtime,
      date
    };
  }).sort((a, b) => b.modified - a.modified); // Sort by modified date, newest first
}

/**
 * Cleanup old sessions based on age
 * @param {string} sessionsDir - Path to sessions directory
 * @param {object} config - Cleanup configuration
 * @returns {Array} Array of deleted file paths
 */
function cleanupByAge(sessionsDir, config) {
  const sessions = findSessionFiles(sessionsDir);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.maxAgeDays);

  const toDelete = sessions.filter(session => {
    // Skip if we can't parse date from filename
    if (!session.date) return false;
    return session.date < cutoffDate;
  });

  return deleteSessions(toDelete, config);
}

/**
 * Cleanup sessions based on maximum count
 * @param {string} sessionsDir - Path to sessions directory
 * @param {object} config - Cleanup configuration
 * @returns {Array} Array of deleted file paths
 */
function cleanupByCount(sessionsDir, config) {
  const sessions = findSessionFiles(sessionsDir);

  if (sessions.length <= config.maxSessions) {
    return [];
  }

  const toDelete = sessions.slice(config.maxSessions); // Keep first N, delete the rest
  return deleteSessions(toDelete, config);
}

/**
 * Cleanup sessions based on directory size
 * @param {string} sessionsDir - Path to sessions directory
 * @param {object} config - Cleanup configuration
 * @returns {Array} Array of deleted file paths
 */
function cleanupBySize(sessionsDir, config) {
  const sessions = findSessionFiles(sessionsDir);
  const maxSizeBytes = config.maxSizeMB * 1024 * 1024;

  // Calculate total size
  let totalSize = sessions.reduce((sum, session) => sum + session.size, 0);

  if (totalSize <= maxSizeBytes) {
    return [];
  }

  // Delete oldest sessions until under size limit
  const toDelete = [];
  const sortedByDate = [...sessions].sort((a, b) => a.modified - b.modified); // Oldest first

  for (const session of sortedByDate) {
    if (totalSize <= maxSizeBytes) break;

    toDelete.push(session);
    totalSize -= session.size;
  }

  return deleteSessions(toDelete, config);
}

/**
 * Delete session files
 * @param {Array} sessions - Session objects to delete
 * @param {object} config - Cleanup configuration
 * @returns {Array} Array of deleted file paths
 */
function deleteSessions(sessions, config) {
  const deleted = [];

  for (const session of sessions) {
    try {
      fs.unlinkSync(session.path);
      deleted.push(session.path);

      if (config.verbose) {
        log(`[Cleanup] Deleted old session: ${session.filename} (${session.size} bytes)`);
      } else {
        log(`[Cleanup] Deleted old session: ${session.filename}`);
      }
    } catch (err) {
      log(`[Cleanup] Error deleting ${session.filename}: ${err.message}`);
    }
  }

  return deleted;
}

/**
 * Get directory size in bytes
 * @param {string} dirPath - Directory path
 * @returns {number} Total size in bytes
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const files = findFiles(dirPath, '*');
    files.forEach(file => {
      try {
        const stats = fs.statSync(file.path);
        totalSize += stats.size;
      } catch (err) {
        // Skip files we can't stat
      }
    });
  } catch (err) {
    // Directory might not exist
  }

  return totalSize;
}

/**
 * Run complete cleanup with all strategies
 * @param {string} sessionsDir - Path to sessions directory (optional, defaults to getSessionsDir())
 * @param {object} userConfig - User configuration (optional)
 * @returns {object} Cleanup results
 */
function runCleanup(sessionsDir = getSessionsDir(), userConfig = {}) {
  const config = { ...DEFAULT_CLEANUP_CONFIG, ...userConfig };

  if (config.verbose) {
    log(`[Cleanup] Starting cleanup with config:`, config);
  }

  const results = {
    deletedByAge: [],
    deletedByCount: [],
    deletedBySize: [],
    directorySize: 0,
    sessionCount: 0
  };

  try {
    // Ensure directory exists
    if (!fs.existsSync(sessionsDir)) {
      log(`[Cleanup] Sessions directory does not exist: ${sessionsDir}`);
      return results;
    }

    // Get initial stats
    const sessions = findSessionFiles(sessionsDir);
    results.sessionCount = sessions.length;
    results.directorySize = getDirectorySize(sessionsDir);

    if (config.verbose) {
      log(`[Cleanup] Before cleanup: ${sessions.length} sessions, ${(results.directorySize / 1024 / 1024).toFixed(2)} MB`);
    }

    // Run cleanup strategies
    results.deletedByAge = cleanupByAge(sessionsDir, config);
    results.deletedByCount = cleanupByCount(sessionsDir, config);
    results.deletedBySize = cleanupBySize(sessionsDir, config);

    // Get final stats
    const finalSessions = findSessionFiles(sessionsDir);
    const finalSize = getDirectorySize(sessionsDir);

    if (config.verbose) {
      log(`[Cleanup] After cleanup: ${finalSessions.length} sessions, ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    }

    // Summary
    const totalDeleted = results.deletedByAge.length + results.deletedByCount.length + results.deletedBySize.length;
    if (totalDeleted > 0) {
      log(`[Cleanup] Cleanup completed: deleted ${totalDeleted} session files`);
    } else {
      log(`[Cleanup] No cleanup needed`);
    }

    return results;

  } catch (err) {
    log(`[Cleanup] Error during cleanup: ${err.message}`);
    return results;
  }
}

module.exports = {
  DEFAULT_CLEANUP_CONFIG,
  findSessionFiles,
  cleanupByAge,
  cleanupByCount,
  cleanupBySize,
  deleteSessions,
  getDirectorySize,
  runCleanup
};