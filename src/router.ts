import { AgentTarget, Classifier, TaskEvaluation } from './types';
import { OmniRouteClassifier } from './classifiers/omniRouteClassifier';

export { AgentTarget, Classifier, TaskEvaluation } from './types';
export { OmniRouteClassifier } from './classifiers/omniRouteClassifier';

export class TaskRouter {
  private classifier: Classifier;

  constructor(classifier?: Classifier) {
    this.classifier = classifier || new OmniRouteClassifier();
  }

  public async route(taskDescription: string): Promise<TaskEvaluation> {
    return TaskRouter.routeTask(taskDescription, this.classifier);
  }

  public static routeCustom(taskDescription: string, customRules: Record<string, string>): TaskEvaluation | null {
    const text = taskDescription.toLowerCase();
    for (const [keyword, agent] of Object.entries(customRules)) {
      if (text.includes(keyword.toLowerCase())) {
        return {
          agent: agent as AgentTarget,
          reason: `Regra customizada: "${keyword}"`,
          estimatedComplexity: 'medium',
          source: 'manual'
        };
      }
    }
    return null;
  }

  public static routeDeterministic(taskDescription: string): TaskEvaluation {
    const text = taskDescription.toLowerCase();

    if (text.includes('spec') || text.includes('docs') || text.includes('documentar') || text.includes('readme')) {
      return {
        agent: 'claude-code',
        reason: 'Tarefas de documentação e especificações',
        estimatedComplexity: 'medium',
        source: 'fallback'
      };
    }

    if (text.includes('refatorar') || text.includes('arquitetura') || text.includes('benchmark')) {
      return {
        agent: 'agy',
        reason: 'Engenharia profunda e refatoração',
        estimatedComplexity: 'high',
        source: 'fallback'
      };
    }

    return {
      agent: 'open-code',
      reason: 'Tarefa direta de codificação ou script simples',
      estimatedComplexity: 'low',
      source: 'fallback'
    };
  }

  public static async routeTask(
    taskDescription: string,
    classifier?: Classifier
  ): Promise<TaskEvaluation> {
    const activeClassifier = classifier || new OmniRouteClassifier();

    try {
      const agent = await activeClassifier.classify(taskDescription);
      console.error(`[router] Decisão via classificador OmniRoute: ${agent}`);

      const complexityMap: Record<AgentTarget, { reason: string; complexity: 'low' | 'medium' | 'high' }> = {
        'claude-code': {
          reason: 'Classificação semântica via OmniRoute (documentação/especificação)',
          complexity: 'medium'
        },
        'agy': {
          reason: 'Classificação semântica via OmniRoute (engenharia profunda/arquitetura)',
          complexity: 'high'
        },
        'open-code': {
          reason: 'Classificação semântica via OmniRoute (codificação/desenvolvimento)',
          complexity: 'low'
        }
      };

      const meta = complexityMap[agent] || complexityMap['open-code'];
      return {
        agent,
        reason: meta.reason,
        estimatedComplexity: meta.complexity,
        source: 'classifier'
      };
    } catch (err: any) {
      console.error(`[router] Classificador indisponível (${err.message}). Usando fallback determinístico.`);
      return this.routeDeterministic(taskDescription);
    }
  }
}