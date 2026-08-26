import { spawn } from 'node:child_process';

export class AgentExitError extends Error {
  constructor(
    agent: string,
    public readonly exitCode: number
  ) {
    super(`Agente ${agent} finalizou com código de saída ${exitCode}`);
  }
}

export class AgentRunner {
  public static readonly commands: Record<string, { cmd: string; args: string[] }> = {
    'claude-code': { cmd: 'claude', args: ['-p'] },
    'open-code': { cmd: 'opencode', args: ['run'] },
    'agy': { cmd: 'agy', args: ['-p'] }
  };

  public static execute(agent: string, prompt: string, context: string = ''): Promise<void> {
    return new Promise((resolve, reject) => {
      const fullPrompt = context ? `[Contexto Obsidian]:\n${context}\n\n[Tarefa]:\n${prompt}` : prompt;
      const selected = this.commands[agent] || this.commands['open-code'];
      const child = spawn(selected.cmd, [...selected.args, fullPrompt], { stdio: 'inherit' });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new AgentExitError(agent, code ?? 1));
      });
    });
  }
}