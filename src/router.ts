export type AgentTarget = 'open-code' | 'claude-code' | 'agy';

export interface TaskEvaluation {
  agent: AgentTarget;
  reason: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export class TaskRouter {
  public static routeTask(taskDescription: string): TaskEvaluation {
    const text = taskDescription.toLowerCase();

    if (text.includes('spec') || text.includes('docs') || text.includes('documentar') || text.includes('readme')) {
      return { agent: 'claude-code', reason: 'Tarefas de documentação e especificações', estimatedComplexity: 'medium' };
    }

    if (text.includes('refatorar') || text.includes('arquitetura') || text.includes('benchmark')) {
      return { agent: 'agy', reason: 'Engenharia profunda e refatoração', estimatedComplexity: 'high' };
    }

    return { agent: 'open-code', reason: 'Tarefa direta de codificação ou script simples', estimatedComplexity: 'low' };
  }
}