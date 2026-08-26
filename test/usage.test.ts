import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadUsageStats, recordUsage } from '../src/usage.js';

test('loadUsageStats returns initial empty stats when no file exists', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'));
  try {
    const stats = loadUsageStats(tempDir);
    assert.equal(stats.totalTasks, 0);
    assert.equal(stats.totalTokens, 0);
    assert.equal(stats.totalDurationMs, 0);
    assert.deepEqual(stats.agentBreakdown, {});
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('recordUsage updates and persists stats to usage.json', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'));
  try {
    recordUsage('claude-code', 1500, 250, tempDir);
    recordUsage('agy', 3000, 800, tempDir);
    recordUsage('claude-code', 1000, 150, tempDir);

    const stats = loadUsageStats(tempDir);
    assert.equal(stats.totalTasks, 3);
    assert.equal(stats.totalTokens, 1200);
    assert.equal(stats.totalDurationMs, 5500);
    assert.equal(stats.agentBreakdown['claude-code'], 2);
    assert.equal(stats.agentBreakdown['agy'], 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
