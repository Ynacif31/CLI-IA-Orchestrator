export type AgentTarget = 'open-code' | 'claude-code' | 'agy';

export interface TaskEvaluation {
  agent: AgentTarget;
  reason: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
  source: 'classifier' | 'fallback' | 'manual';
}

export interface Classifier {
  classify(taskDescription: string): Promise<AgentTarget>;
}

export interface OmniRouteConfig {
  baseUrl?: string;
  authToken?: string;
  model?: string;
  timeoutMs?: number;
}

export interface ObsidianConfig {
  command?: string;
  args?: string[];
  vaultPath?: string;
}

export interface TaskLogEntry {
  agent: AgentTarget | string;
  task: string;
  reason: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
  exitCode: number;
  durationMs: number;
  date?: Date;
}
