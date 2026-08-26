import * as fs from 'node:fs';
import * as path from 'node:path';

export interface UsageStats {
  totalTasks: number;
  totalTokens: number;
  totalDurationMs: number;
  agentBreakdown: Record<string, number>;
}

export function loadUsageStats(searchDir: string = process.cwd()): UsageStats {
  const candidateFiles = [
    path.join(searchDir, 'usage.json'),
    path.join(searchDir, '.orchestrator', 'usage.json'),
    path.join(searchDir, 'graphify-out', 'cost.json')
  ];

  for (const file of candidateFiles) {
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        const data = JSON.parse(raw);
        if (data.total_input_tokens !== undefined) {
          return {
            totalTasks: data.runs?.length || 0,
            totalTokens: (data.total_input_tokens || 0) + (data.total_output_tokens || 0),
            totalDurationMs: 0,
            agentBreakdown: {}
          };
        }
        if (data.totalTasks !== undefined || data.totalTokens !== undefined) {
          return {
            totalTasks: data.totalTasks || 0,
            totalTokens: data.totalTokens || 0,
            totalDurationMs: data.totalDurationMs || 0,
            agentBreakdown: data.agentBreakdown || {}
          };
        }
      } catch {}
    }
  }

  return {
    totalTasks: 0,
    totalTokens: 0,
    totalDurationMs: 0,
    agentBreakdown: {}
  };
}

export function recordUsage(
  agent: string,
  durationMs: number,
  tokens: number = 0,
  searchDir: string = process.cwd()
): void {
  const usageFile = path.join(searchDir, 'usage.json');
  const current = loadUsageStats(searchDir);

  current.totalTasks += 1;
  current.totalTokens += tokens;
  current.totalDurationMs += durationMs;
  current.agentBreakdown[agent] = (current.agentBreakdown[agent] || 0) + 1;

  try {
    fs.writeFileSync(usageFile, JSON.stringify(current, null, 2), 'utf-8');
  } catch {}
}