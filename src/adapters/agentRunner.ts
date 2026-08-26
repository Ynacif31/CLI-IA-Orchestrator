import { spawn } from 'node:child_process';

export interface RunResult {
  exitCode: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

export interface RunOptions {
  cmd?: string;
  context?: string;
}

export class AgentRunner {
  public static readonly commands: Record<string, { cmd: string; args: string[]; json?: boolean }> = {
    'claude-code': { cmd: 'claude', args: ['-p', '--output-format', 'json'], json: true },
    'open-code': { cmd: 'opencode', args: ['run'] },
    'agy': { cmd: 'agy', args: ['-p', '--output-format', 'json'], json: true }
  };

  public static execute(agent: string, prompt: string, opts: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const selected = this.commands[agent] || this.commands['open-code'];
      const fullPrompt = opts.context
        ? `[Contexto Obsidian]:\n${opts.context}\n\n[Tarefa]:\n${prompt}`
        : prompt;
      const start = Date.now();
      const child = spawn(opts.cmd ?? selected.cmd, [...selected.args, fullPrompt], {
        stdio: ['inherit', selected.json ? 'pipe' : 'inherit', 'inherit']
      });

      let stdout = '';
      if (child.stdout) {
        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
          process.stdout.write(chunk);
        });
      }

      child.on('error', reject);

      child.on('close', (code) => {
        const durationMs = Date.now() - start;
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        if (selected.json && stdout) {
          try {
            const parsed = JSON.parse(stdout) as { usage?: { input_tokens?: number; output_tokens?: number } };
            inputTokens = parsed.usage?.input_tokens ?? null;
            outputTokens = parsed.usage?.output_tokens ?? null;
          } catch {
            /* resposta não-JSON: tokens desconhecidos */
          }
        }
        resolve({ exitCode: code, inputTokens, outputTokens, durationMs });
      });
    });
  }
}