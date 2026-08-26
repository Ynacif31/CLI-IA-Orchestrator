import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveOmniRouteConfig, loadSettingsFromFile } from '../src/config';

test('resolveOmniRouteConfig returns defaults when no env or file is present', () => {
  const originalEnv = { ...process.env };
  delete process.env.OMNIROUTE_BASE_URL;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.OMNIROUTE_AUTH_TOKEN;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OMNIROUTE_MODEL;
  delete process.env.ANTHROPIC_MODEL;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
  try {
    const config = resolveOmniRouteConfig({}, tempDir);
    assert.equal(config.baseUrl, 'http://localhost:20128');
    assert.equal(config.model, 'combo/default');
    assert.equal(config.timeoutMs, 4000);
    assert.equal(config.authToken, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  }
});

test('resolveOmniRouteConfig reads from process.env', () => {
  const originalEnv = { ...process.env };
  process.env.ANTHROPIC_BASE_URL = 'http://custom-host:20128/';
  process.env.ANTHROPIC_AUTH_TOKEN = 'secret-token-123';
  process.env.ANTHROPIC_MODEL = 'combo/anthropic-fast';

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
  try {
    const config = resolveOmniRouteConfig({}, tempDir);
    assert.equal(config.baseUrl, 'http://custom-host:20128');
    assert.equal(config.authToken, 'secret-token-123');
    assert.equal(config.model, 'combo/anthropic-fast');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  }
});

test('resolveOmniRouteConfig reads from Settings.local.json', () => {
  const originalEnv = { ...process.env };
  delete process.env.OMNIROUTE_BASE_URL;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.OMNIROUTE_AUTH_TOKEN;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OMNIROUTE_MODEL;
  delete process.env.ANTHROPIC_MODEL;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
  const settingsFile = path.join(tempDir, 'Settings.local.json');
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: 'http://local-proxy:20128',
        ANTHROPIC_AUTH_TOKEN: 'file-token-456',
        ANTHROPIC_MODEL: 'combo/my-coding-combo'
      }
    })
  );

  try {
    const config = resolveOmniRouteConfig({}, tempDir);
    assert.equal(config.baseUrl, 'http://local-proxy:20128');
    assert.equal(config.authToken, 'file-token-456');
    assert.equal(config.model, 'combo/my-coding-combo');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  }
});

test('resolveOmniRouteConfig overrides take highest precedence', () => {
  const originalEnv = { ...process.env };
  process.env.ANTHROPIC_BASE_URL = 'http://env-host:20128';

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
  fs.writeFileSync(
    path.join(tempDir, 'Settings.local.json'),
    JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'http://file-host:20128' }
    })
  );

  try {
    const config = resolveOmniRouteConfig(
      {
        baseUrl: 'http://cli-override:20128',
        model: 'combo/cli-model',
        authToken: 'cli-token'
      },
      tempDir
    );
    assert.equal(config.baseUrl, 'http://cli-override:20128');
    assert.equal(config.authToken, 'cli-token');
    assert.equal(config.model, 'combo/cli-model');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  }
});
