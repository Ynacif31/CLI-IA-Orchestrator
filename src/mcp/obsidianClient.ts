import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TaskLogEntry } from '../types';

export function formatLogTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${YYYY}-${MM}-${DD}T${HH}-${mm}-${ss}`;
}

export function buildTaskLogContent(logData: TaskLogEntry, date: Date = new Date()): string {
  const promptMaxLen = 2000;
  const truncatedPrompt =
    logData.task.length > promptMaxLen
      ? `${logData.task.slice(0, promptMaxLen)}\n... [truncado, total: ${logData.task.length} caracteres]`
      : logData.task;

  const durationSec = (logData.durationMs / 1000).toFixed(2);

  return `---
tags:
  - agent-run
created_at: ${date.toISOString()}
agent: ${logData.agent}
complexity: ${logData.estimatedComplexity}
exit_code: ${logData.exitCode}
duration_ms: ${logData.durationMs}
---

# Agent Run: ${logData.agent} #agent-run

- **Agente**: \`${logData.agent}\`
- **Motivo do Roteamento**: ${logData.reason}
- **Complexidade Estimada**: \`${logData.estimatedComplexity}\`
- **Duração**: ${durationSec}s (${logData.durationMs}ms)
- **Exit Code**: ${logData.exitCode}
- **Timestamp**: ${date.toISOString()}

## Prompt Enviado

\`\`\`
${truncatedPrompt}
\`\`\`
`;
}

export class ObsidianMcpBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(client?: Client) {
    if (client) {
      this.client = client;
    }
  }

  public isConnected(): boolean {
    return this.client !== null;
  }

  public async connect(mcpCommand: string, mcpArgs: string[] = []): Promise<void> {
    try {
      this.transport = new StdioClientTransport({ command: mcpCommand, args: mcpArgs });
      this.client = new Client({ name: 'agent-orchestrator', version: '1.0.0' }, { capabilities: {} });
      await this.client.connect(this.transport);
    } catch (err: any) {
      this.client = null;
      this.transport = null;
      throw new Error(`Falha ao conectar ao servidor MCP Obsidian: ${err.message}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {}
      this.client = null;
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {}
      this.transport = null;
    }
  }

  public async getContextNotes(query: string): Promise<string> {
    if (!this.client) return '';
    try {
      const searchTools = ['search_notes', 'search_files', 'search'];
      for (const toolName of searchTools) {
        try {
          const result = await this.client.callTool({
            name: toolName,
            arguments: { query }
          });
          if (result) {
            return this.formatSearchResult(result);
          }
        } catch {
          // Tool not available, try next fallback
        }
      }
      return '';
    } catch {
      return '';
    }
  }

  private formatSearchResult(result: any): string {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (Array.isArray(result.content)) {
      return result.content
        .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
        .join('\n');
    }
    return JSON.stringify(result, null, 2);
  }

  public async createTaskLog(logData: TaskLogEntry): Promise<string | null> {
    if (!this.client) return null;

    const date = logData.date || new Date();
    const timestamp = formatLogTimestamp(date);
    const notePath = `Daily/AgentLogs/${timestamp} - agent-run.md`;
    const content = buildTaskLogContent(logData, date);

    try {
      const writeTools = [
        { name: 'write_file', args: { path: notePath, content } },
        { name: 'create_note', args: { path: notePath, content } },
        { name: 'create_file', args: { path: notePath, content } },
        { name: 'edit_file', args: { path: notePath, content } }
      ];

      for (const tool of writeTools) {
        try {
          await this.client.callTool({
            name: tool.name,
            arguments: tool.args
          });
          return notePath;
        } catch {
          // Try next tool
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
