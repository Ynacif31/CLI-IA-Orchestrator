import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import * as yaml from 'js-yaml';
import { OmniRouteConfig, ObsidianConfig } from './types';

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
  obsidian?: {
    command?: string;
    args?: string[];
    vaultPath?: string;
  };
  mcpServers?: {
    obsidian?: {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    };
    [serverName: string]: any;
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
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authToken,
    model,
    timeoutMs
  };
}

export function parseArgsArray(rawArgs: string | string[] | undefined): string[] {
  if (!rawArgs) return [];
  if (Array.isArray(rawArgs)) return rawArgs;
  if (rawArgs.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawArgs);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
  }
  return rawArgs.split(' ').map((s) => s.trim()).filter(Boolean);
}

export function resolveObsidianConfig(
  overrides: Partial<ObsidianConfig> = {},
  searchDir: string = process.cwd()
): ObsidianConfig {
  const fileSettings = loadSettingsFromFile(searchDir) || {};
  const fileEnv = fileSettings.env || {};

  const command =
    overrides.command ||
    process.env.OBSIDIAN_MCP_COMMAND ||
    fileSettings.obsidian?.command ||
    fileSettings.mcpServers?.obsidian?.command ||
    fileEnv.OBSIDIAN_MCP_COMMAND;

  let args: string[] | undefined = overrides.args;
  if (!args) {
    if (process.env.OBSIDIAN_MCP_ARGS) {
      args = parseArgsArray(process.env.OBSIDIAN_MCP_ARGS);
    } else if (fileSettings.obsidian?.args) {
      args = parseArgsArray(fileSettings.obsidian.args);
    } else if (fileSettings.mcpServers?.obsidian?.args) {
      args = parseArgsArray(fileSettings.mcpServers.obsidian.args);
    } else if (fileEnv.OBSIDIAN_MCP_ARGS) {
      args = parseArgsArray(fileEnv.OBSIDIAN_MCP_ARGS);
    }
  }

  const vaultPath =
    overrides.vaultPath ||
    process.env.OBSIDIAN_VAULT_PATH ||
    fileSettings.obsidian?.vaultPath ||
    fileEnv.OBSIDIAN_VAULT_PATH;

  return {
    command,
    args: args || [],
    vaultPath
  };
}

// ==== RFC 0006: runtime config em ~/.orchestrator/config.yaml ====

export interface RuntimeConfig {
  agents: Record<string, { cmd: string }>;
  routing: Record<string, string>;
  threshold: number;
}

const RUNTIME_DIR = path.join(homedir(), '.orchestrator');
export const CONFIG_FILE = path.join(RUNTIME_DIR, 'config.yaml');

export const DEFAULTS: RuntimeConfig = {
  agents: {
    'claude-code': { cmd: 'claude' },
    'open-code': { cmd: 'opencode' },
    'agy': { cmd: 'agy' }
  },
  routing: {},
  threshold: 100_000
};

export function loadConfig(): RuntimeConfig {
  if (!fs.existsSync(CONFIG_FILE)) return structuredClone(DEFAULTS);
  try {
    const raw = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8')) as Partial<RuntimeConfig> | undefined;
    return {
      agents: { ...DEFAULTS.agents, ...(raw?.agents ?? {}) },
      routing: raw?.routing ?? {},
      threshold: typeof raw?.threshold === 'number' ? raw.threshold : DEFAULTS.threshold
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveConfig(cfg: RuntimeConfig): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, yaml.dump(cfg));
}

export function dumpConfig(cfg: RuntimeConfig): string {
  return yaml.dump(cfg);
}

export function getConfigValue(cfg: RuntimeConfig, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, cfg);
}

export function setConfigValue(cfg: RuntimeConfig, key: string, value: unknown): void {
  const parts = key.split('.');
  const root = cfg as unknown as Record<string, unknown>;
  let cur = root;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (next == null || typeof next !== 'object') cur[part] = {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function coerceValue(raw: string): unknown {
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}