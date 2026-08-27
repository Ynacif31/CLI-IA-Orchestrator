import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentLine } from '../src/adapters/agentRunner.js';

test('parseAgentLine extracts model from claude/agy system init event', () => {
  const { event } = parseAgentLine(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5' }));
  assert.equal(event?.model, 'claude-sonnet-5');
});

test('parseAgentLine extracts tokens and text from claude/agy assistant event', () => {
  const { event, text } = parseAgentLine(JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-sonnet-5',
      usage: { input_tokens: 100, output_tokens: 20 },
      content: [{ type: 'text', text: 'oi' }]
    }
  }));
  assert.equal(event?.inputTokens, 100);
  assert.equal(event?.outputTokens, 20);
  assert.equal(text, 'oi');
});

test('parseAgentLine extracts tool_use from claude/agy assistant event', () => {
  const { event } = parseAgentLine(JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash' }] }
  }));
  assert.equal(event?.toolName, 'Bash');
});

test('parseAgentLine extracts tokens from opencode step-finish event', () => {
  const { event } = parseAgentLine(JSON.stringify({
    part: { type: 'step-finish', tokens: { total: 10, input: 8, output: 2 } }
  }));
  assert.equal(event?.inputTokens, 8);
  assert.equal(event?.outputTokens, 2);
});

test('parseAgentLine extracts tool name and text from opencode part events', () => {
  const toolResult = parseAgentLine(JSON.stringify({ part: { type: 'tool', tool: 'bash' } }));
  assert.equal(toolResult.event?.toolName, 'bash');

  const textResult = parseAgentLine(JSON.stringify({ part: { type: 'text', text: 'oi' } }));
  assert.equal(textResult.text, 'oi');
});

test('parseAgentLine ignores invalid JSON without throwing', () => {
  const result = parseAgentLine('not json');
  assert.equal(result.event, null);
  assert.equal(result.text, null);
});
