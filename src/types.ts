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
