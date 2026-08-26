import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OmniRouteClassifier,
  buildOmniRouteEndpoint,
  parseClassifierResponse
} from '../src/classifiers/omniRouteClassifier.js';

test('buildOmniRouteEndpoint constructs valid messages endpoints', () => {
  assert.equal(buildOmniRouteEndpoint('http://localhost:20128'), 'http://localhost:20128/v1/messages');
  assert.equal(buildOmniRouteEndpoint('http://localhost:20128/'), 'http://localhost:20128/v1/messages');
  assert.equal(buildOmniRouteEndpoint('http://localhost:20128/v1'), 'http://localhost:20128/v1/messages');
  assert.equal(buildOmniRouteEndpoint('http://localhost:20128/v1/'), 'http://localhost:20128/v1/messages');
  assert.equal(buildOmniRouteEndpoint('http://localhost:20128/v1/messages'), 'http://localhost:20128/v1/messages');
});

test('parseClassifierResponse correctly parses valid agent names', () => {
  assert.equal(parseClassifierResponse('open-code'), 'open-code');
  assert.equal(parseClassifierResponse('claude-code'), 'claude-code');
  assert.equal(parseClassifierResponse('agy'), 'agy');
  assert.equal(parseClassifierResponse('  "claude-code"  \n'), 'claude-code');
  assert.equal(parseClassifierResponse('`open-code`'), 'open-code');
  assert.equal(parseClassifierResponse('AGY'), 'agy');
});

test('parseClassifierResponse throws on invalid/unexpected string', () => {
  assert.throws(() => parseClassifierResponse('gpt-4'), /Resposta de classificação inesperada/);
  assert.throws(() => parseClassifierResponse(''), /Resposta de classificação inesperada/);
  assert.throws(() => parseClassifierResponse('unknown agent'), /Resposta de classificação inesperada/);
});

test('OmniRouteClassifier sends request and parses Anthropic format', async () => {
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: any = null;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = input.toString();
    capturedHeaders = init?.headers as Record<string, string>;
    capturedBody = JSON.parse(init?.body as string);

    return new Response(
      JSON.stringify({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'claude-code' }]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const classifier = new OmniRouteClassifier(
    {
      baseUrl: 'http://localhost:20128',
      authToken: 'test-token',
      model: 'combo/test-combo'
    },
    mockFetch
  );

  const result = await classifier.classify('escrever documentação da API');

  assert.equal(result, 'claude-code');
  assert.equal(capturedUrl, 'http://localhost:20128/v1/messages');
  assert.equal(capturedHeaders['x-api-key'], 'test-token');
  assert.equal(capturedHeaders['Authorization'], 'Bearer test-token');
  assert.equal(capturedHeaders['anthropic-version'], '2023-06-01');
  assert.equal(capturedBody.model, 'combo/test-combo');
  assert.equal(capturedBody.messages[0].content, 'Task to classify: escrever documentação da API');
});

test('OmniRouteClassifier parses OpenAI-compatible response format if proxy returns choices', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'agy'
            }
          }
        ]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const classifier = new OmniRouteClassifier({}, mockFetch);
  const result = await classifier.classify('otimizar arquitetura distribuída');
  assert.equal(result, 'agy');
});

test('OmniRouteClassifier throws on HTTP error response', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response('Rate limit exceeded', { status: 429, statusText: 'Too Many Requests' });
  };

  const classifier = new OmniRouteClassifier({}, mockFetch);
  await assert.rejects(
    () => classifier.classify('qualquer tarefa'),
    /OmniRoute retornou status HTTP 429/
  );
});

test('OmniRouteClassifier throws on network/connection failure', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('fetch failed ECONNREFUSED');
  };

  const classifier = new OmniRouteClassifier({}, mockFetch);
  await assert.rejects(
    () => classifier.classify('qualquer tarefa'),
    /Erro de rede ao conectar com OmniRoute/
  );
});
