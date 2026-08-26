import { AgentTarget, Classifier, OmniRouteConfig } from '../types.js';
import { resolveOmniRouteConfig } from '../config.js';

const SYSTEM_PROMPT = `You are an expert AI task router for software engineering workflows. Your job is to classify the user's task into exactly ONE of the following 3 agent targets:
- "claude-code": Tasks primarily focused on documentation, writing READMEs, creating OpenAPI/API specs, writing documentation guides, tutorials, or explaining architecture.
- "agy": Tasks focused on deep software engineering, complex system architecture design, large-scale refactoring, performance benchmarks, or intricate algorithmic optimizations.
- "open-code": General programming tasks, feature implementation, scripts, bug fixes, CLI tools, day-to-day coding, and simple development tasks.

CRITICAL INSTRUCTION: Respond with ONLY the exact agent name ('open-code', 'claude-code', or 'agy'). Do NOT include markdown, punctuation, quotation marks, or any other words.`;

export function buildOmniRouteEndpoint(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, '');
  if (clean.endsWith('/v1/messages')) {
    return clean;
  }
  if (clean.endsWith('/v1')) {
    return `${clean}/messages`;
  }
  return `${clean}/v1/messages`;
}

export function parseClassifierResponse(raw: string): AgentTarget {
  const cleaned = raw.trim().toLowerCase().replace(/[`"']/g, '');
  if (cleaned === 'open-code' || cleaned === 'claude-code' || cleaned === 'agy') {
    return cleaned;
  }

  // Check if matches with word boundaries
  const match = cleaned.match(/\b(open-code|claude-code|agy)\b/);
  if (match) {
    return match[1] as AgentTarget;
  }

  throw new Error(`Resposta de classificação inesperada: "${raw}"`);
}

export class OmniRouteClassifier implements Classifier {
  private config: OmniRouteConfig;
  private fetchFn: typeof fetch;

  constructor(configOverrides?: Partial<OmniRouteConfig>, customFetch?: typeof fetch) {
    this.config = resolveOmniRouteConfig(configOverrides);
    this.fetchFn = customFetch || globalThis.fetch;
  }

  public async classify(taskDescription: string): Promise<AgentTarget> {
    const endpoint = buildOmniRouteEndpoint(this.config.baseUrl || 'http://localhost:20128');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };

    if (this.config.authToken) {
      headers['x-api-key'] = this.config.authToken;
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const payload = {
      model: this.config.model || 'combo/default',
      max_tokens: 30,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Task to classify: ${taskDescription}`
        }
      ]
    };

    const timeoutMs = this.config.timeoutMs || 4000;
    const signal = AbortSignal.timeout(timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`Timeout ao conectar com OmniRoute (${timeoutMs}ms) em ${endpoint}`);
      }
      throw new Error(`Erro de rede ao conectar com OmniRoute (${endpoint}): ${err.message}`);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`OmniRoute retornou status HTTP ${res.status} (${res.statusText}): ${errorText}`);
    }

    const data = await res.json().catch(() => null) as any;
    if (!data) {
      throw new Error('OmniRoute retornou resposta JSON vazia ou inválida');
    }

    // Extract text from Anthropic or OpenAI structure
    let extractedText = '';
    if (Array.isArray(data.content) && data.content.length > 0) {
      extractedText = data.content.map((c: any) => c.text || '').join('');
    } else if (typeof data.content === 'string') {
      extractedText = data.content;
    } else if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      extractedText = data.choices[0].message.content;
    } else if (data.text) {
      extractedText = data.text;
    }

    if (!extractedText) {
      throw new Error('Não foi possível extrair o texto de resposta do OmniRoute');
    }

    return parseClassifierResponse(extractedText);
  }
}
