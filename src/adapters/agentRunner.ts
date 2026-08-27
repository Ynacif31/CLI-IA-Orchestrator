import { spawn } from 'node:child_process';

export interface RunResult {
  exitCode: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

export interface AgentEvent {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  toolName?: string;
}

export interface RunOptions {
  cmd?: string;
  context?: string;
  /** Called live as telemetry (model/tokens/tool calls) arrives via streamed NDJSON. */
  onEvent?: (event: AgentEvent) => void;
  /** When true, suppress raw text echo to stdout (used by the Ink UI, which owns the terminal frame). */
  silent?: boolean;
}

/**
 * Extracts telemetry from one line of streamed NDJSON output.
 * "claude" and "agy" share the Anthropic Agent SDK stream-json shape (system/assistant/result events).
 * "opencode" uses its own step-based shape (part.type step-finish/tool/text) and does not expose
 * which model served a step in the stream, so `model` stays undefined for it.
 */
export function parseAgentLine(line: string): { event: AgentEvent | null; text: string | null } {
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return { event: null, text: null };
  }

  if (obj.type === 'system' && obj.subtype === 'init') {
    return { event: { model: obj.model }, text: null };
  }
  if (obj.type === 'assistant' && obj.message) {
    const usage = obj.message.usage;
    const content = Array.isArray(obj.message.content) ? obj.message.content : [];
    const toolUse = content.find((c: any) => c.type === 'tool_use');
    const text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    return {
      event: {
        model: obj.message.model,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        toolName: toolUse?.name
      },
      text: text || null
    };
  }
  if (obj.type === 'result' && obj.usage) {
    return { event: { inputTokens: obj.usage.input_tokens, outputTokens: obj.usage.output_tokens }, text: null };
  }

  // opencode step-based events
  if (obj.part?.type === 'step-finish' && obj.part.tokens) {
    return { event: { inputTokens: obj.part.tokens.input, outputTokens: obj.part.tokens.output }, text: null };
  }
  if (obj.part?.type === 'tool' && obj.part.tool) {
    return { event: { toolName: obj.part.tool }, text: null };
  }
  if (obj.part?.type === 'text' && obj.part.text) {
    return { event: null, text: obj.part.text };
  }

  return { event: null, text: null };
}

export class AgentRunner {
  public static readonly commands: Record<string, { cmd: string; args: string[]; json?: boolean }> = {
    'claude-code': { cmd: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'], json: true },
    'open-code': { cmd: 'opencode', args: ['run', '--format', 'json', '-m', 'opencode-go/deepseek-v4-flash', '--variant', 'max'], json: true },
    'agy': { cmd: 'agy', args: ['-p', '--output-format', 'stream-json', '--verbose'], json: true }
  };

  public static execute(agent: string, prompt: string, opts: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const selected = this.commands[agent] || this.commands['open-code'];
      const fullPrompt = opts.context
        ? `[Contexto Obsidian]:\n${opts.context}\n\n[Tarefa]:\n${prompt}`
        : prompt;
      const start = Date.now();
      const child = spawn(opts.cmd ?? selected.cmd, [...selected.args, fullPrompt], {
        stdio: ['inherit', 'pipe', 'inherit']
      });

      let lineBuffer = '';
      let lastInputTokens: number | null = null;
      let lastOutputTokens: number | null = null;

      child.stdout?.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const { event, text } = parseAgentLine(line);
          if (event) {
            if (event.inputTokens != null) lastInputTokens = event.inputTokens;
            if (event.outputTokens != null) lastOutputTokens = event.outputTokens;
            opts.onEvent?.(event);
          }
          if (text && !opts.silent) {
            process.stdout.write(text + '\n');
          }
        }
      });

      child.on('error', reject);

      child.on('close', (code) => {
        const durationMs = Date.now() - start;
        resolve({ exitCode: code, inputTokens: lastInputTokens, outputTokens: lastOutputTokens, durationMs });
      });
    });
  }
}
