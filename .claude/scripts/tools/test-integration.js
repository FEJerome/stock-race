#!/usr/bin/env node
/**
 * Integration Test Tool for Claude Code Memory Persistence System
 *
 * Tests all hooks and functionality in the memory persistence optimization system
 * Tests include:
 * 1. Session persistence (start/end)
 * 2. Context compression suggestions
 * 3. Session evaluation and pattern detection
 * 4. Performance monitoring
 * 5. Configuration loading
 *
 * Usage:
 * node test-integration.js [--hook <hookName>] [--all] [--verbose]
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Import utility functions
const {
  getSessionsDir,
  getLearnedSkillsDir,
  getTempDir,
  ensureDir,
  log,
  loadConfig
} = require('../lib/utils');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * Test runner class
 */
class IntegrationTestRunner {
  constructor(options = {}) {
    this.options = {
      verbose: false,
      testAll: true,
      hooksToTest: [],
      cleanupAfter: true,
      ...options
    };

    this.results = [];
    this.startTime = Date.now();

    // Set up test directories
    this.testSessionsDir = path.join(getTempDir(), 'test-claude-sessions');
    this.testSkillsDir = path.join(getTempDir(), 'test-claude-skills');

    // Ensure test directories exist
    ensureDir(this.testSessionsDir);
    ensureDir(this.testSkillsDir);

    // Set test environment variables
    this.originalEnv = { ...process.env };
    this.setupTestEnvironment();
  }

  /**
   * Set up test environment
   */
  setupTestEnvironment() {
    process.env.CLAUDE_SESSION_JSON = 'false'; // Use text format for testing
    process.env.CLAUDE_CLEANUP_ENABLED = 'false'; // Don't cleanup during tests
    process.env.CLAUDE_SESSIONS_DIR = this.testSessionsDir;
    process.env.CLAUDE_LEARNED_SKILLS_DIR = this.testSkillsDir;
    process.env.CLAUDE_TRANSCRIPT_PATH = path.join(this.testSessionsDir, 'test-transcript.json');
    process.env.CLAUDE_SESSION_ID = 'test-session-' + Date.now();
  }

  /**
   * Restore original environment
   */
  restoreEnvironment() {
    for (const [key, value] of Object.entries(this.originalEnv)) {
      process.env[key] = value;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log(`${colors.cyan}=== Claude Code Memory Persistence Integration Tests ===${colors.reset}\n`);

    await this.testConfigLoading();
    await this.testSessionStart();
    await this.testSessionEnd();
    await this.testSessionCleanup();
    await this.testPreCompact();
    await this.testEvaluateSession();
    await this.testSuggestCompact();
    await this.testPerformanceMonitoring();

    this.printSummary();
    this.cleanup();
  }

  /**
   * Test 1: Configuration loading
   */
  async testConfigLoading() {
    const testName = 'Configuration Loading';
    console.log(`${colors.blue}[Test 1] ${testName}${colors.reset}`);

    try {
      // Create test config
      const configDir = path.join(__dirname, '..', '..', 'skills', 'continuous-learning');
      const configFile = path.join(configDir, 'config.json');

      ensureDir(configDir);

      const testConfig = {
        min_session_length: 5,
        extraction_threshold: 'medium',
        auto_approve: false,
        learned_skills_path: this.testSkillsDir,
        patterns_to_detect: ['error_resolution', 'project_specific'],
        ignore_patterns: ['simple_typos']
      };

      fs.writeFileSync(configFile, JSON.stringify(testConfig, null, 2));

      // Test loadConfig function
      const config = loadConfig(configFile);

      if (!config) {
        throw new Error('Failed to load configuration');
      }

      if (config.min_session_length !== 5) {
        throw new Error(`Expected min_session_length=5, got ${config.min_session_length}`);
      }

      if (config.patterns_to_detect.length !== 2) {
        throw new Error(`Expected 2 patterns, got ${config.patterns_to_detect.length}`);
      }

      this.recordResult(testName, true, 'Configuration loaded and validated successfully');
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Test 2: Session start hook
   */
  async testSessionStart() {
    const testName = 'Session Start Hook';
    console.log(`${colors.blue}[Test 2] ${testName}${colors.reset}`);

    try {
      // Create a test session file
      const testSessionFile = path.join(this.testSessionsDir, '2026-02-07-test123-session.tmp');
      fs.writeFileSync(testSessionFile, '# Test session\nStarted: 10:00\nUpdated: 10:05\n---\nState: Testing\n');

      // Run session-start.js (capture both stdout and stderr)
      const hookPath = path.join(__dirname, '..', 'hooks', 'session-start.js');
      const output = execSync(`node "${hookPath}" 2>&1`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
      });

      if (this.options.verbose) {
        console.log(`Output: ${output}`);
      }

      // Check for expected log messages
      if (!output.includes('[SessionStart]') && !output.includes('Found')) {
        throw new Error('Session start hook did not produce expected output');
      }

      this.recordResult(testName, true, 'Session start hook executed successfully');
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Test 3: Session end hook
   */
  async testSessionEnd() {
    const testName = 'Session End Hook';
    console.log(`${colors.blue}[Test 3] ${testName}${colors.reset}`);

    try {
      // Run session-end.js
      const hookPath = path.join(__dirname, '..', 'hooks', 'session-end.js');
      const output = execSync(`node "${hookPath}" 2>&1`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
      });

      if (this.options.verbose) {
        console.log(`Output: ${output}`);
      }

      // Check if session file was created
      const sessionFiles = fs.readdirSync(this.testSessionsDir).filter(f => f.endsWith('-session.tmp'));
      if (sessionFiles.length === 0) {
        throw new Error('No session file was created');
      }

      const latestSessionFile = path.join(this.testSessionsDir, sessionFiles[0]);
      const content = fs.readFileSync(latestSessionFile, 'utf8');

      if (!content.includes('Started:') || !content.includes('Updated:')) {
        throw new Error('Session file missing required fields');
      }

      this.recordResult(testName, true, `Session file created: ${sessionFiles[0]}`);
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Test 4: Session cleanup
   */
  async testSessionCleanup() {
    const testName = 'Session Cleanup';
    console.log(`${colors.blue}[Test 4] ${testName}${colors.reset}`);

    try {
      // Create old session file
      const oldSessionFile = path.join(this.testSessionsDir, '2026-01-01-old-session.tmp');
      fs.writeFileSync(oldSessionFile, '# Old session\n');

      // Run session-cleanup.js with aggressive settings
      process.env.CLAUDE_CLEANUP_ENABLED = 'true';
      process.env.CLAUDE_CLEANUP_MAX_AGE_DAYS = '1';
      process.env.CLAUDE_CLEANUP_MAX_SESSIONS = '1';

      const hookPath = path.join(__dirname, '..', 'hooks', 'session-cleanup.js');
      const output = execSync(`node "${hookPath}" 2>&1`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
      });

      if (this.options.verbose) {
        console.log(`Output: ${output}`);
      }

      // Check if old session was cleaned up
      if (fs.existsSync(oldSessionFile)) {
        throw new Error('Old session file was not cleaned up');
      }

      this.recordResult(testName, true, 'Session cleanup executed successfully');
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Test 5: Pre-compact hook
   */
  async testPreCompact() {
    const testName = 'Pre-Compact Hook';
    console.log(`${colors.blue}[Test 5] ${testName}${colors.reset}`);

    try {
      const hookPath = path.join(__dirname, '..', 'hooks', 'pre-compact.js');
      const output = execSync(`node "${hookPath}" 2>&1`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
      });

      if (this.options.verbose) {
        console.log(`Output: ${output}`);
      }

      if (!output.includes('[PreCompact]')) {
        throw new Error('Pre-compact hook did not produce expected output');
      }

      this.recordResult(testName, true, 'Pre-compact hook executed successfully');
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Test 6: Evaluate session hook
   */
  async testEvaluateSession() {
    const testName = 'Evaluate Session Hook';
    console.log(`${colors.blue}[Test 6] ${testName}${colors.reset}`);

    try {
      // Create a test transcript
      const transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
      const testTranscript = {
        messages: [
          { type: 'user', content: 'Test message 1' },
          { type: 'assistant', content: 'Test response 1' },
          { type: 'user', content: 'Test message 2' },
          { type: 'assistant', content: 'Test response 2' }
        ]
      };

      fs.writeFileSync(transcriptPath, JSON.stringify(testTranscript, null, 2));

      // Run evaluate-session.js
      const hookPath = path.join(__dirname, '..', 'hooks', 'evaluate-session.js');
      const output = execSync(`node "${hookPath}" 2>&1`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
      });

      if (this.options.verbose) {
        console.log(`Output: ${output}`);
      }

      if (!output.includes('[ContinuousLearning]')) {
        throw new Error('Evaluate session hook did not produce expected output');
      }

      this.recordResult(testName, true, 'Evaluate session hook executed successfully');
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Test 7: Suggest compact hook
   */
  async testSuggestCompact() {
    const testName = 'Suggest Compact Hook';
    console.log(`${colors.blue}[Test 7] ${testName}${colors.reset}`);

    try {
      const hookPath = path.join(__dirname, '..', 'hooks', 'suggest-compact.js');
      const output = execSync(`node "${hookPath}" 2>&1`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
      });

      if (this.options.verbose) {
        console.log(`Output: ${output}`);
      }

      // This hook might not produce output on first run
      // Just check that it executes without error
      this.recordResult(testName, true, 'Suggest compact hook executed successfully');
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Test 8: Performance monitoring
   */
  async testPerformanceMonitoring() {
    const testName = 'Performance Monitoring';
    console.log(`${colors.blue}[Test 8] ${testName}${colors.reset}`);

    try {
      // Load performance monitor module
      const perfModule = require('../lib/performance-monitor');
      const { PerformanceMonitor } = perfModule;

      // Test instantiation
      const monitor = new PerformanceMonitor('test-hook');
      monitor.start();

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = monitor.stop(true);

      if (!stats || !stats.hookName || !stats.elapsedMs) {
        throw new Error('Performance monitor did not return valid stats');
      }

      // Test cleanup
      const deleted = PerformanceMonitor.cleanupOldStats(0); // Clean up everything
      if (this.options.verbose) {
        console.log(`Cleaned up ${deleted} old stats files`);
      }

      this.recordResult(testName, true, 'Performance monitoring tested successfully');
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  /**
   * Record test result
   */
  recordResult(testName, passed, message) {
    const result = {
      testName,
      passed,
      message,
      timestamp: new Date().toISOString()
    };

    this.results.push(result);

    const statusIcon = passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    const statusColor = passed ? colors.green : colors.red;

    console.log(`  ${statusIcon} ${statusColor}${testName}${colors.reset}: ${message}`);

    if (!passed && this.options.verbose) {
      console.log(`    Error details: ${message}`);
    }
  }

  /**
   * Print test summary
   */
  printSummary() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);

    console.log(`\n${colors.cyan}=== Test Summary ===${colors.reset}`);
    console.log(`Total tests: ${totalTests}`);
    console.log(`Passed: ${colors.green}${passedTests}${colors.reset}`);
    console.log(`Failed: ${failedTests > 0 ? colors.red : colors.reset}${failedTests}${colors.reset}`);
    console.log(`Duration: ${duration} seconds`);
    console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.log(`\n${colors.yellow}Failed tests:${colors.reset}`);
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  ${colors.red}✗${colors.reset} ${r.testName}: ${r.message}`);
      });
    }
  }

  /**
   * Clean up test files
   */
  cleanup() {
    if (this.options.cleanupAfter) {
      try {
        // Remove test directories
        if (fs.existsSync(this.testSessionsDir)) {
          fs.rmSync(this.testSessionsDir, { recursive: true, force: true });
        }
        if (fs.existsSync(this.testSkillsDir)) {
          fs.rmSync(this.testSkillsDir, { recursive: true, force: true });
        }

        console.log(`${colors.green}Test directories cleaned up${colors.reset}`);
      } catch (error) {
        console.log(`${colors.yellow}Warning: Could not clean up test directories: ${error.message}${colors.reset}`);
      }
    }

    // Restore original environment
    this.restoreEnvironment();
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    testAll: true,
    hooksToTest: [],
    cleanupAfter: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--no-cleanup') {
      options.cleanupAfter = false;
    } else if (arg === '--hook' && i + 1 < args.length) {
      options.testAll = false;
      options.hooksToTest.push(args[++i]);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
${colors.cyan}Claude Code Memory Persistence Integration Test Tool${colors.reset}

Usage:
  node test-integration.js [options]

Options:
  --verbose, -v           Show detailed output
  --hook <hookName>       Test specific hook only
  --no-cleanup           Don't cleanup test files after testing
  --help, -h             Show this help message

Available hooks to test:
  - config-loading
  - session-start
  - session-end
  - session-cleanup
  - pre-compact
  - evaluate-session
  - suggest-compact
  - performance-monitoring

Examples:
  node test-integration.js --verbose
  node test-integration.js --hook session-end
  node test-integration.js --hook session-start --hook session-end
  `);
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();
  const runner = new IntegrationTestRunner(options);

  try {
    if (options.testAll) {
      await runner.runAllTests();
    } else {
      // Run specific hooks only
      console.log(`${colors.cyan}=== Running specific hook tests ===${colors.reset}\n`);

      for (const hookName of options.hooksToTest) {
        switch(hookName.toLowerCase()) {
          case 'config-loading':
            await runner.testConfigLoading();
            break;
          case 'session-start':
            await runner.testSessionStart();
            break;
          case 'session-end':
            await runner.testSessionEnd();
            break;
          case 'session-cleanup':
            await runner.testSessionCleanup();
            break;
          case 'pre-compact':
            await runner.testPreCompact();
            break;
          case 'evaluate-session':
            await runner.testEvaluateSession();
            break;
          case 'suggest-compact':
            await runner.testSuggestCompact();
            break;
          case 'performance-monitoring':
            await runner.testPerformanceMonitoring();
            break;
          default:
            console.log(`${colors.yellow}Unknown hook: ${hookName}${colors.reset}`);
        }
      }

      runner.printSummary();
      runner.cleanup();
    }
  } catch (error) {
    console.error(`${colors.red}Test runner error: ${error.message}${colors.reset}`);
    runner.restoreEnvironment();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  });
}

// Export for programmatic use
module.exports = IntegrationTestRunner;