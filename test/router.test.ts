import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskRouter } from '../src/router.js';
import type { Classifier, AgentTarget } from '../src/types.js';

class MockClassifier implements Classifier {
  constructor(private result?: AgentTarget, private shouldFail: boolean = false) {}

  async classify(_taskDescription: string): Promise<AgentTarget> {
    if (this.shouldFail) {
      throw new Error('OmniRoute connection failed / timeout');
    }
    return this.result || 'open-code';
  }
}

test('TaskRouter.routeDeterministic routes keywords correctly', () => {
  // Docs keywords -> claude-code
  const docResult = TaskRouter.routeDeterministic('escrever documentar a API de checkout');
  assert.equal(docResult.agent, 'claude-code');
  assert.equal(docResult.estimatedComplexity, 'medium');
  assert.equal(docResult.source, 'fallback');

  const readmeResult = TaskRouter.routeDeterministic('atualizar readme e spec do projeto');
  assert.equal(readmeResult.agent, 'claude-code');

  // Deep engineering keywords -> agy
  const refactorResult = TaskRouter.routeDeterministic('refatorar a camada de persistência');
  assert.equal(refactorResult.agent, 'agy');
  assert.equal(refactorResult.estimatedComplexity, 'high');

  const archResult = TaskRouter.routeDeterministic('analisar arquitetura e benchmark de latência');
  assert.equal(archResult.agent, 'agy');

  // Default / coding keywords -> open-code
  const codeResult = TaskRouter.routeDeterministic('criar script de backup diário');
  assert.equal(codeResult.agent, 'open-code');
  assert.equal(codeResult.estimatedComplexity, 'low');
});

test('TaskRouter.routeTask uses Classifier when available', async () => {
  const classifier = new MockClassifier('agy');
  const result = await TaskRouter.routeTask('otimizar throughput do pipeline', classifier);

  assert.equal(result.agent, 'agy');
  assert.equal(result.source, 'classifier');
  assert.equal(result.estimatedComplexity, 'high');
  assert.match(result.reason, /Classificação semântica via OmniRoute/);
});

test('TaskRouter.routeTask falls back to deterministic rules when Classifier fails', async () => {
  const failingClassifier = new MockClassifier(undefined, true);

  // Ambiguous task falling back to default open-code
  const fallbackResult = await TaskRouter.routeTask('tarefa qualquer sem keywords', failingClassifier);
  assert.equal(fallbackResult.agent, 'open-code');
  assert.equal(fallbackResult.source, 'fallback');

  // Task with doc keyword falling back to claude-code
  const docFallback = await TaskRouter.routeTask('escrever docs do sistema', failingClassifier);
  assert.equal(docFallback.agent, 'claude-code');
  assert.equal(docFallback.source, 'fallback');

  // Task with refactor keyword falling back to agy
  const refactorFallback = await TaskRouter.routeTask('refatorar o core', failingClassifier);
  assert.equal(refactorFallback.agent, 'agy');
  assert.equal(refactorFallback.source, 'fallback');
});
