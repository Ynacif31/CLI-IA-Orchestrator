import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskRouter } from '../src/router';
import { OmniRouteClassifier } from '../src/classifiers/omniRouteClassifier';

test('Acceptance Criterion 1: Ambiguous task is routed correctly when OmniRoute is available', async () => {
  // A task like "elaborar o manual técnico do usuário e guia de início"
  // doesn't contain 'spec', 'docs', 'documentar', 'readme' from Phase 1 keywords,
  // but OmniRoute semantically classifies it as 'claude-code'.
  const mockFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(init?.body as string);
    const task = body.messages[0].content;

    let agent = 'open-code';
    if (task.includes('manual técnico') || task.includes('guia de início')) {
      agent = 'claude-code';
    } else if (task.includes('gargalo de concorrência')) {
      agent = 'agy';
    }

    return new Response(
      JSON.stringify({
        content: [{ type: 'text', text: agent }]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const classifier = new OmniRouteClassifier({}, mockFetch);

  // Ambiguous task 1: documentation without keywords
  const eval1 = await TaskRouter.routeTask(
    'elaborar o manual técnico do usuário e guia de início',
    classifier
  );
  assert.equal(eval1.agent, 'claude-code');
  assert.equal(eval1.source, 'classifier');

  // Ambiguous task 2: concurrency bottleneck analysis
  const eval2 = await TaskRouter.routeTask(
    'investigar gargalo de concorrência no pipeline de eventos',
    classifier
  );
  assert.equal(eval2.agent, 'agy');
  assert.equal(eval2.source, 'classifier');
});

test('Acceptance Criterion 2: Dropping OmniRoute API/key or simulating timeout falls back cleanly without breaking execution', async () => {
  // Simulating network failure / invalid API key / timeout
  const failingFetch: typeof fetch = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:20128');
  };

  const classifier = new OmniRouteClassifier({}, failingFetch);

  // Ambiguous task with dead OmniRoute
  const evalAmbiguous = await TaskRouter.routeTask('criar componente de card responsivo', classifier);
  assert.equal(evalAmbiguous.agent, 'open-code');
  assert.equal(evalAmbiguous.source, 'fallback');

  // Task with keywords with dead OmniRoute
  const evalDoc = await TaskRouter.routeTask('escrever readme do projeto', classifier);
  assert.equal(evalDoc.agent, 'claude-code');
  assert.equal(evalDoc.source, 'fallback');

  const evalRefactor = await TaskRouter.routeTask('refatorar módulo de autenticação', classifier);
  assert.equal(evalRefactor.agent, 'agy');
  assert.equal(evalRefactor.source, 'fallback');
});
