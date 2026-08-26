import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';

export interface UsageStats {
  totalTasks: number;
  totalTokens: number;
  totalDurationMs: number;
  agentBreakdown: Record<string, number>;
}

export interface UsageEntry {
  timestamp: string;
  agent: string;
  tokens: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs: number;
}

export function orchestratorDir(): string {
  return path.join(homedir(), '.orchestrator');
}

function usageFile(dir: string): string {
  return path.join(dir, 'usage.json');
}

const EMPTY_STATS: UsageStats = {
  totalTasks: 0,
  totalTokens: 0,
  totalDurationMs: 0,
  agentBreakdown: {}
};

function aggregateEntries(entries: UsageEntry[]): UsageStats {
  const stats: UsageStats = { totalTasks: 0, totalTokens: 0, totalDurationMs: 0, agentBreakdown: {} };
  for (const e of entries) {
    stats.totalTasks += 1;
    stats.totalTokens += e.tokens;
    stats.totalDurationMs += e.durationMs;
    stats.agentBreakdown[e.agent] = (stats.agentBreakdown[e.agent] || 0) + 1;
  }
  return stats;
}

export function loadUsageStats(searchDir: string = orchestratorDir()): UsageStats {
  const file = usageFile(searchDir);
  if (!fs.existsSync(file)) return { ...EMPTY_STATS, agentBreakdown: {} };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (Array.isArray(data)) return aggregateEntries(data);
    return {
      totalTasks: data.totalTasks || 0,
      totalTokens: data.totalTokens || 0,
      totalDurationMs: data.totalDurationMs || 0,
      agentBreakdown: data.agentBreakdown || {}
    };
  } catch {
    return { ...EMPTY_STATS, agentBreakdown: {} };
  }
}

export function loadEntries(searchDir: string = orchestratorDir()): UsageEntry[] {
  const file = usageFile(searchDir);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function recordUsage(
  agent: string,
  durationMs: number,
  tokens: number = 0,
  searchDir: string = orchestratorDir(),
  extra?: { inputTokens?: number | null; outputTokens?: number | null }
): void {
  const entries = loadEntries(searchDir);
  entries.push({
    timestamp: new Date().toISOString(),
    agent,
    tokens,
    inputTokens: extra?.inputTokens ?? null,
    outputTokens: extra?.outputTokens ?? null,
    durationMs
  });
  try {
    fs.mkdirSync(searchDir, { recursive: true });
    fs.writeFileSync(usageFile(searchDir), JSON.stringify(entries, null, 2), 'utf-8');
  } catch {}
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

  const sum = (list: UsageEntry[]) =>
    list.reduce(
      (acc, e) => ({ runs: acc.runs + 1, tokens: acc.tokens + e.tokens, durationMs: acc.durationMs + e.durationMs }),
      { runs: 0, tokens: 0, durationMs: 0 }
    );

  const today = sum(entries.filter((e) => e.timestamp.startsWith(day)));
  const monthly = sum(entries.filter((e) => e.timestamp.startsWith(month)));
  const all = loadUsageStats();

  console.log(`Hoje:  ${today.runs} execução(ões) · ${formatTokens(today.tokens)} tokens · ${formatMs(today.durationMs)}`);
  console.log(`Mês:   ${monthly.runs} execução(ões) · ${formatTokens(monthly.tokens)} tokens · ${formatMs(monthly.durationMs)}`);
  console.log(`Total: ${all.totalTasks} execução(ões) · ${formatTokens(all.totalTokens)} tokens · ${formatMs(all.totalDurationMs)}`);
  const breakdown = Object.entries(all.agentBreakdown)
    .map(([agent, count]) => `${agent}: ${count}`)
    .join(' · ');
  if (breakdown) console.log(`Por agente: ${breakdown}`);
  if (today.tokens > threshold) {
    console.log(`ALERTA: uso de hoje (${formatTokens(today.tokens)} tokens) passou do limite de ${formatTokens(threshold)}`);
  }
}