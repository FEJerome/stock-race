#!/usr/bin/env node
/**
 * Continuous Learning - Enhanced Session Evaluator
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on Stop hook to extract reusable patterns from Claude Code sessions
 * Enhanced version with pattern detection and intelligent extraction
 *
 * Why Stop hook instead of UserPromptSubmit:
 * - Stop runs once at session end (lightweight)
 * - UserPromptSubmit runs every message (heavy, adds latency)
 */

const path = require('path');
const fs = require('fs');
const {
  getLearnedSkillsDir,
  ensureDir,
  readFile,
  countInFile,
  log,
  loadConfig,
  getPatternMatcher,
  detectPatterns
} = require('../lib/utils');

async function main() {
  // Get script directory to find config
  const scriptDir = __dirname;
  const configFile = path.join(scriptDir, '..', '..', 'skills', 'continuous-learning', 'config.json');

  // Load configuration using utility function
  const config = loadConfig(configFile);

  const minSessionLength = config.min_session_length;
  const extractionMode = config.extraction_threshold;
  let learnedSkillsPath = config.learned_skills_path.replace(/^~/, require('os').homedir());
  const patternsToDetect = config.patterns_to_detect;
  const ignorePatterns = config.ignore_patterns;
  const projectSpecificPatterns = config.project_specific_patterns;

  log(`[ContinuousLearning] Config loaded: ${patternsToDetect.length} patterns to detect`);

  // Ensure learned skills directory exists
  ensureDir(learnedSkillsPath);

  // Get transcript path from environment (set by Claude Code)
  const transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  // Count user messages in session
  const messageCount = countInFile(transcriptPath, /"type":"user"/g);

  // Skip short sessions
  if (messageCount < minSessionLength) {
    log(`[ContinuousLearning] Session too short (${messageCount} messages), skipping`);
    process.exit(0);
  }

  // Enhanced evaluation based on extraction mode
  if (extractionMode === 'basic') {
    // Basic mode: just signal Claude
    log(`[ContinuousLearning] Session has ${messageCount} messages - evaluate for extractable patterns`);
    log(`[ContinuousLearning] Save learned skills to: ${learnedSkillsPath}`);
  } else if (extractionMode === 'medium' || extractionMode === 'enhanced') {
    // Enhanced mode: provide pattern detection guidance
    log(`[ContinuousLearning] Session has ${messageCount} messages - enhanced evaluation triggered`);
    log(`[ContinuousLearning] Looking for patterns: ${patternsToDetect.slice(0, 3).join(', ')}${patternsToDetect.length > 3 ? '...' : ''}`);

    // Check for project-specific patterns
    if (projectSpecificPatterns.stock_race && projectSpecificPatterns.stock_race.length > 0) {
      log(`[ContinuousLearning] Project-specific patterns: ${projectSpecificPatterns.stock_race.slice(0, 3).join(', ')}${projectSpecificPatterns.stock_race.length > 3 ? '...' : ''}`);
    }

    log(`[ContinuousLearning] Save learned skills to: ${learnedSkillsPath}`);
  } else if (extractionMode === 'full') {
    // Full mode: detailed guidance
    log(`[ContinuousLearning] Session has ${messageCount} messages - full analysis mode`);
    log(`[ContinuousLearning] Patterns to detect: ${patternsToDetect.join(', ')}`);
    log(`[ContinuousLearning] Ignoring: ${ignorePatterns.join(', ')}`);

    // Provide guidance for different pattern types
    patternsToDetect.forEach(pattern => {
      switch(pattern) {
        case 'error_resolution':
          log(`[ContinuousLearning] Focus on error patterns, debugging steps, and solutions`);
          break;
        case 'user_corrections':
          log(`[ContinuousLearning] Look for user corrections, feedback incorporation, and requirement adjustments`);
          break;
        case 'workarounds':
          log(`[ContinuousLearning] Identify workarounds, temporary solutions, and alternative approaches`);
          break;
        case 'debugging_techniques':
          log(`[ContinuousLearning] Analyze debugging techniques, troubleshooting methods, and root cause analysis`);
          break;
        case 'project_specific':
          log(`[ContinuousLearning] Extract project-specific knowledge: stock data processing, AI decision flows, trading strategies`);
          break;
        case 'architecture_decisions':
          log(`[ContinuousLearning] Look for architectural choices, design patterns, system structure`);
          break;
        case 'tool_usage_patterns':
          log(`[ContinuousLearning] Identify tool usage patterns, Claude Code configurations, and automation workflows`);
          break;
        case 'code_review_patterns':
          log(`[ContinuousLearning] Review code review patterns, refactoring techniques, and performance optimizations`);
          break;
      }
    });

    log(`[ContinuousLearning] Save detailed skills to: ${learnedSkillsPath}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[ContinuousLearning] Error:', err.message);
  process.exit(0);
});