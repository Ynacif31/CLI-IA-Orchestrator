import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

export interface UsageEntry {
  timestamp: string;
  agent: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

const DIR = path.join(homedir(), '.orchestrator');
const FILE = path.join(DIR, 'usage.json');

export function recordUsage(entry: UsageEntry): void {
  const entries = loadEntries();
  entries.push(entry);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(entries, null, 2));
}

export function loadEntries(): UsageEntry[] {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as UsageEntry[];
  } catch {
    return [];
  }
}

function formatTokens(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function printUsageReport(threshold: number): void {
  const entries = loadEntries();
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const month = now.slice(0, 7);

  const summarize = (window: string) => {
    const list = entries.filter((e) => e.timestamp.startsWith(window));
    return {
      runs: list.length,
      tokens: list.reduce((acc, e) => acc + (e.inputTokens ?? 0) + (e.outputTokens ?? 0), 0),
      durationMs: list.reduce((acc, e) => acc + e.durationMs, 0)
    };
  };

  const today = summarize(day);
  const monthly = summarize(month);

  console.log(`Hoje: ${today.runs} execução(ões) · ${formatTokens(today.tokens)} tokens · ${formatMs(today.durationMs)}`);
  console.log(`Mês:  ${monthly.runs} execução(ões) · ${formatTokens(monthly.tokens)} tokens · ${formatMs(monthly.durationMs)}`);
  if (today.tokens > threshold) {
    console.log(`ALERTA: uso de hoje (${formatTokens(today.tokens)} tokens) passou do limite de ${formatTokens(threshold)}`);
  }
}