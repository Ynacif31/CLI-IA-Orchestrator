import * as fs from 'node:fs';
import * as path from 'node:path';
import { OmniRouteConfig } from './types';

const DEFAULT_BASE_URL = 'http://localhost:20128';
const DEFAULT_MODEL = 'combo/default';
const DEFAULT_TIMEOUT_MS = 4000;

interface SettingsJson {
  env?: Record<string, string>;
  baseUrl?: string;
  authToken?: string;
  model?: string;
  timeoutMs?: number;
  omniroute?: {
    baseUrl?: string;
    authToken?: string;
    model?: string;
    timeoutMs?: number;
  };
}

export function loadSettingsFromFile(searchDir: string = process.cwd()): SettingsJson | null {
  const candidateFiles = [
    path.join(searchDir, 'Settings.local.json'),
    path.join(searchDir, 'settings.local.json'),
    path.join(searchDir, '.claude', 'Settings.local.json'),
    path.join(searchDir, '.claude', 'settings.json'),
    path.join(searchDir, 'orchestrator.json'),
    path.join(searchDir, '.orchestratorrc.json')
  ];

  for (const filePath of candidateFiles) {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as SettingsJson;
      } catch {
        // If file exists but is invalid JSON, ignore and try next
      }
    }
  }

  return null;
}

export function resolveOmniRouteConfig(
  overrides: Partial<OmniRouteConfig> = {},
  searchDir: string = process.cwd()
): OmniRouteConfig {
  const fileSettings = loadSettingsFromFile(searchDir) || {};
  const fileEnv = fileSettings.env || {};

  const baseUrl =
    overrides.baseUrl ||
    process.env.OMNIROUTE_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    fileSettings.omniroute?.baseUrl ||
    fileSettings.baseUrl ||
    fileEnv.OMNIROUTE_BASE_URL ||
    fileEnv.ANTHROPIC_BASE_URL ||
    DEFAULT_BASE_URL;

  const authToken =
    overrides.authToken ||
    process.env.OMNIROUTE_AUTH_TOKEN ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_API_KEY ||
    fileSettings.omniroute?.authToken ||
    fileSettings.authToken ||
    fileEnv.OMNIROUTE_AUTH_TOKEN ||
    fileEnv.ANTHROPIC_AUTH_TOKEN ||
    fileEnv.ANTHROPIC_API_KEY;

  const model =
    overrides.model ||
    process.env.OMNIROUTE_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    fileSettings.omniroute?.model ||
    fileSettings.model ||
    fileEnv.OMNIROUTE_MODEL ||
    fileEnv.ANTHROPIC_MODEL ||
    DEFAULT_MODEL;

  const envTimeout = process.env.OMNIROUTE_TIMEOUT_MS ? parseInt(process.env.OMNIROUTE_TIMEOUT_MS, 10) : undefined;
  const fileTimeout = fileSettings.omniroute?.timeoutMs || fileSettings.timeoutMs;
  const timeoutMs = overrides.timeoutMs || envTimeout || fileTimeout || DEFAULT_TIMEOUT_MS;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''), // strip trailing slashes
    authToken,
    model,
    timeoutMs
  };
}
