import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ObsidianMcpBridge,
  formatLogTimestamp,
  buildTaskLogContent
} from '../src/mcp/obsidianClient';
import { TaskLogEntry } from '../src/types';

test('formatLogTimestamp formats date into ISO-like filename friendly string', () => {
  const date = new Date(2026, 7, 25, 15, 30, 45); // August 25, 2026 15:30:45
  const timestamp = formatLogTimestamp(date);
  assert.equal(timestamp, '2026-08-25T15-30-45');
});

test('buildTaskLogContent includes frontmatter, tag #agent-run, metadata and prompt', () => {
  const date = new Date(2026, 7, 25, 15, 30, 0);
  const logData: TaskLogEntry = {
    agent: 'claude-code',
    task: 'documentar a API de billing',
    reason: 'Tarefas de documentação e especificações',
    estimatedComplexity: 'medium',
    exitCode: 0,
    durationMs: 1540
  };

  const content = buildTaskLogContent(logData, date);

  assert.match(content, /^---\ntags:\n  - agent-run/);
  assert.match(content, /agent: claude-code/);
  assert.match(content, /complexity: medium/);
  assert.match(content, /exit_code: 0/);
  assert.match(content, /duration_ms: 1540/);
  assert.match(content, /# Agent Run: claude-code #agent-run/);
  assert.match(content, /\*\*Motivo do Roteamento\*\*: Tarefas de documentação e especificações/);
  assert.match(content, /documentar a API de billing/);
});

test('buildTaskLogContent truncates very long prompts', () => {
  const hugeTask = 'a'.repeat(3000);
  const logData: TaskLogEntry = {
    agent: 'agy',
    task: hugeTask,
    reason: 'Refatoração',
    estimatedComplexity: 'high',
    exitCode: 0,
    durationMs: 5000
  };

  const content = buildTaskLogContent(logData);
  assert.match(content, /\[truncado, total: 3000 caracteres\]/);
});

test('ObsidianMcpBridge behaves safely when disconnected', async () => {
  const bridge = new ObsidianMcpBridge();
  assert.equal(bridge.isConnected(), false);

  const context = await bridge.getContextNotes('buscar notas');
  assert.equal(context, '');

  const logResult = await bridge.createTaskLog({
    agent: 'open-code',
    task: 'script simples',
    reason: 'Codificação',
    estimatedComplexity: 'low',
    exitCode: 0,
    durationMs: 200
  });
  assert.equal(logResult, null);
});

test('ObsidianMcpBridge getContextNotes retrieves notes via mock client', async () => {
  let calledTool = '';
  let calledArgs: any = null;

  const mockClient: any = {
    async callTool(params: { name: string; arguments: any }) {
      calledTool = params.name;
      calledArgs = params.arguments;
      return {
        content: [
          { type: 'text', text: 'Nota de Contexto: Arquitetura de Billing e APIs' }
        ]
      };
    },
    async close() {}
  };

  const bridge = new ObsidianMcpBridge(mockClient);
  assert.equal(bridge.isConnected(), true);

  const context = await bridge.getContextNotes('billing api');
  assert.equal(calledTool, 'search_notes');
  assert.deepEqual(calledArgs, { query: 'billing api' });
  assert.equal(context, 'Nota de Contexto: Arquitetura de Billing e APIs');

  await bridge.disconnect();
  assert.equal(bridge.isConnected(), false);
});

test('ObsidianMcpBridge createTaskLog writes note to Daily/AgentLogs/ with minimal fields', async () => {
  let capturedTool = '';
  let capturedArgs: any = null;

  const mockClient: any = {
    async callTool(params: { name: string; arguments: any }) {
      capturedTool = params.name;
      capturedArgs = params.arguments;
      return { ok: true };
    },
    async close() {}
  };

  const bridge = new ObsidianMcpBridge(mockClient);
  const fixedDate = new Date(2026, 7, 25, 15, 30, 0);

  const notePath = await bridge.createTaskLog({
    agent: 'agy',
    task: 'refatorar o motor de mensageria',
    reason: 'Engenharia profunda',
    estimatedComplexity: 'high',
    exitCode: 0,
    durationMs: 2500,
    date: fixedDate
  });

  assert.equal(notePath, 'Daily/AgentLogs/2026-08-25T15-30-00 - agent-run.md');
  assert.equal(capturedTool, 'write_file');
  assert.equal(capturedArgs.path, 'Daily/AgentLogs/2026-08-25T15-30-00 - agent-run.md');
  assert.match(capturedArgs.content, /# Agent Run: agy #agent-run/);
  assert.match(capturedArgs.content, /tags:\n  - agent-run/);
  assert.match(capturedArgs.content, /exit_code: 0/);
  assert.match(capturedArgs.content, /duration_ms: 2500/);
});

test('ObsidianMcpBridge handles search/write tool errors without throwing', async () => {
  const failingClient: any = {
    async callTool() {
      throw new Error('MCP server tool execution failed / timeout');
    },
    async close() {}
  };

  const bridge = new ObsidianMcpBridge(failingClient);

  // Search fails gracefully
  const context = await bridge.getContextNotes('qualquer query');
  assert.equal(context, '');

  // Log write fails gracefully
  const logResult = await bridge.createTaskLog({
    agent: 'open-code',
    task: 'tarefa',
    reason: 'Codificação',
    estimatedComplexity: 'low',
    exitCode: 1,
    durationMs: 500
  });
  assert.equal(logResult, null);
});
