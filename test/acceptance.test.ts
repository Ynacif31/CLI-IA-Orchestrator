import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskRouter } from '../src/router';
import { OmniRouteClassifier } from '../src/classifiers/omniRouteClassifier';
import { ObsidianMcpBridge } from '../src/mcp/obsidianClient';
import { TaskLogEntry } from '../src/types';

// RFC 0004 Acceptance Tests
test('RFC 0004 - Acceptance Criterion 1: Ambiguous task is routed correctly when OmniRoute is available', async () => {
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

  const eval1 = await TaskRouter.routeTask(
    'elaborar o manual técnico do usuário e guia de início',
    classifier
  );
  assert.equal(eval1.agent, 'claude-code');
  assert.equal(eval1.source, 'classifier');

  const eval2 = await TaskRouter.routeTask(
    'investigar gargalo de concorrência no pipeline de eventos',
    classifier
  );
  assert.equal(eval2.agent, 'agy');
  assert.equal(eval2.source, 'classifier');
});

test('RFC 0004 - Acceptance Criterion 2: Dropping OmniRoute API/key or simulating timeout falls back cleanly without breaking execution', async () => {
  const failingFetch: typeof fetch = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:20128');
  };

  const classifier = new OmniRouteClassifier({}, failingFetch);

  const evalAmbiguous = await TaskRouter.routeTask('criar componente de card responsivo', classifier);
  assert.equal(evalAmbiguous.agent, 'open-code');
  assert.equal(evalAmbiguous.source, 'fallback');

  const evalDoc = await TaskRouter.routeTask('escrever readme do projeto', classifier);
  assert.equal(evalDoc.agent, 'claude-code');
  assert.equal(evalDoc.source, 'fallback');

  const evalRefactor = await TaskRouter.routeTask('refatorar módulo de autenticação', classifier);
  assert.equal(evalRefactor.agent, 'agy');
  assert.equal(evalRefactor.source, 'fallback');
});

// RFC 0005 Acceptance Tests
test('RFC 0005 - Acceptance Criterion 1: Running task with Obsidian MCP enabled generates note in Daily/AgentLogs/ with minimal fields', async () => {
  let createdFilePath = '';
  let createdFileContent = '';

  const mockClient: any = {
    async callTool(params: { name: string; arguments: any }) {
      if (params.name === 'search_notes') {
        return {
          content: [{ type: 'text', text: 'Nota de Contexto Relevante do Vault' }]
        };
      }
      if (params.name === 'write_file') {
        createdFilePath = params.arguments.path;
        createdFileContent = params.arguments.content;
        return { ok: true };
      }
      return {};
    },
    async close() {}
  };

  const bridge = new ObsidianMcpBridge(mockClient);

  // Pre-execution context retrieval
  const context = await bridge.getContextNotes('documentar endpoints da v2');
  assert.equal(context, 'Nota de Contexto Relevante do Vault');

  // Post-execution task log creation
  const logData: TaskLogEntry = {
    agent: 'claude-code',
    task: 'documentar endpoints da v2',
    reason: 'Tarefas de documentação e especificações',
    estimatedComplexity: 'medium',
    exitCode: 0,
    durationMs: 1420
  };

  const generatedPath = await bridge.createTaskLog(logData);
  assert.ok(generatedPath);
  assert.match(generatedPath, /^Daily\/AgentLogs\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2} - agent-run\.md$/);
  assert.equal(createdFilePath, generatedPath);

  // Verify minimal required fields and #agent-run tag
  assert.match(createdFileContent, /tags:\n  - agent-run/);
  assert.match(createdFileContent, /agent: claude-code/);
  assert.match(createdFileContent, /complexity: medium/);
  assert.match(createdFileContent, /exit_code: 0/);
  assert.match(createdFileContent, /duration_ms: 1420/);
  assert.match(createdFileContent, /#agent-run/);
  assert.match(createdFileContent, /Tarefas de documentação e especificações/);
  assert.match(createdFileContent, /documentar endpoints da v2/);

  await bridge.disconnect();
});

test('RFC 0005 - Acceptance Criterion 2: Running without Obsidian MCP server does not crash or block execution', async () => {
  // Bridge with no connection or failing connection
  const disconnectedBridge = new ObsidianMcpBridge();

  const context = await disconnectedBridge.getContextNotes('qualquer tarefa');
  assert.equal(context, '');

  const logResult = await disconnectedBridge.createTaskLog({
    agent: 'open-code',
    task: 'criar script de migração',
    reason: 'Tarefa direta de codificação',
    estimatedComplexity: 'low',
    exitCode: 0,
    durationMs: 450
  });
  assert.equal(logResult, null);
  await disconnectedBridge.disconnect();
});
