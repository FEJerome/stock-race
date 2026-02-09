#!/usr/bin/env node
/**
 * Quick test for memory persistence functionality
 * Tests basic hook functionality without extensive setup
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

console.log('=== Quick Test for Memory Persistence Functionality ===\n');

// Set up test environment
const testDir = path.join(require('os').tmpdir(), 'claude-quick-test-' + Date.now());
fs.mkdirSync(testDir, { recursive: true });

const originalEnv = { ...process.env };
process.env.CLAUDE_SESSION_JSON = 'false';
process.env.CLAUDE_CLEANUP_ENABLED = 'false';
process.env.CLAUDE_SESSION_ID = 'test-' + Date.now();

const hooksDir = path.join(__dirname, '..', 'hooks');

// Test 1: Check that utils.js loads correctly
console.log('1. Testing utils.js module loading...');
try {
    const utils = require('../lib/utils');
    console.log('   ✓ utils.js loaded successfully');
    console.log(`   Functions available: ${Object.keys(utils).length}`);
} catch (error) {
    console.log(`   ✗ Failed to load utils.js: ${error.message}`);
    process.exit(1);
}

// Test 2: Test session-end.js
console.log('\n2. Testing session-end.js...');
try {
    const output = execSync(`node "${path.join(hooksDir, 'session-end.js')}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
    });
    console.log('   ✓ session-end.js executed successfully');
    if (output.includes('SessionEnd')) {
        console.log('   ✓ Output contains expected log markers');
    }
} catch (error) {
    console.log(`   ✗ session-end.js failed: ${error.message}`);
    if (error.stdout) console.log(`   Output: ${error.stdout.toString().substring(0, 200)}`);
}

// Test 3: Test session-start.js
console.log('\n3. Testing session-start.js...');
try {
    const output = execSync(`node "${path.join(hooksDir, 'session-start.js')}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
    });
    console.log('   ✓ session-start.js executed successfully');
    if (output.includes('SessionStart')) {
        console.log('   ✓ Output contains expected log markers');
    }
} catch (error) {
    console.log(`   ✗ session-start.js failed: ${error.message}`);
}

// Test 4: Test pre-compact.js
console.log('\n4. Testing pre-compact.js...');
try {
    const output = execSync(`node "${path.join(hooksDir, 'pre-compact.js')}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
    });
    console.log('   ✓ pre-compact.js executed successfully');
} catch (error) {
    console.log(`   ✗ pre-compact.js failed: ${error.message}`);
}

// Test 5: Test evaluate-session.js (with mock transcript)
console.log('\n5. Testing evaluate-session.js...');
try {
    // Create a mock transcript
    const transcriptPath = path.join(testDir, 'transcript.json');
    const mockTranscript = {
        messages: [
            { type: 'user', content: 'Test message about fixing errors' },
            { type: 'assistant', content: 'Test response with solution' }
        ]
    };
    fs.writeFileSync(transcriptPath, JSON.stringify(mockTranscript));
    process.env.CLAUDE_TRANSCRIPT_PATH = transcriptPath;

    const output = execSync(`node "${path.join(hooksDir, 'evaluate-session.js')}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
    });
    console.log('   ✓ evaluate-session.js executed successfully');
    if (output.includes('ContinuousLearning')) {
        console.log('   ✓ Output contains ContinuousLearning markers');
    }
} catch (error) {
    console.log(`   ✗ evaluate-session.js failed: ${error.message}`);
}

// Test 6: Test suggest-compact.js
console.log('\n6. Testing suggest-compact.js...');
try {
    const output = execSync(`node "${path.join(hooksDir, 'suggest-compact.js')}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env
    });
    console.log('   ✓ suggest-compact.js executed successfully');
    // This hook might not produce output on first run
} catch (error) {
    console.log(`   ✗ suggest-compact.js failed: ${error.message}`);
}

// Test 7: Check configuration loading
console.log('\n7. Testing configuration loading...');
try {
    const configPath = path.join(__dirname, '..', '..', 'skills', 'continuous-learning', 'config.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`   ✓ Configuration loaded: ${config.patterns_to_detect.length} patterns defined`);
        console.log(`   Patterns: ${config.patterns_to_detect.slice(0, 3).join(', ')}${config.patterns_to_detect.length > 3 ? '...' : ''}`);
    } else {
        console.log('   ⚠ Configuration file not found, but this is okay for basic testing');
    }
} catch (error) {
    console.log(`   ✗ Configuration test failed: ${error.message}`);
}

// Cleanup
console.log('\n=== Test Summary ===');
console.log('All basic functionality tests completed.');
console.log('\nNote: This is a quick test, not a comprehensive integration test.');
console.log('For full testing, run: node test-integration.js --verbose');

// Restore environment
for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
}

// Clean up test directory
try {
    fs.rmSync(testDir, { recursive: true, force: true });
} catch (error) {
    // Ignore cleanup errors
}

process.exit(0);