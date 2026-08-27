import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, RunResult } from './agentRunner.js';

export interface PermissionRequest {
  toolName: string;
  input: Record<string, unknown>;
}

export interface SdkRunOptions {
  context?: string;
  onEvent?: (event: AgentEvent) => void;
  /** Called before each tool executes; resolve true to allow, false to deny. */
  onPermissionRequest?: (req: PermissionRequest) => Promise<boolean>;
}

/**
 * Runs claude-code via the official Agent SDK instead of shelling out to the `claude` binary.
 * Unlike the subprocess path (agentRunner.ts), this surfaces each tool permission request
 * through `onPermissionRequest` instead of auto-denying it (`claude -p` has no channel to
 * ask the parent process back for approval).
 */
export async function runClaudeSdk(prompt: string, opts: SdkRunOptions = {}): Promise<RunResult> {
  const fullPrompt = opts.context
    ? `[Contexto Obsidian]:\n${opts.context}\n\n[Tarefa]:\n${prompt}`
    : prompt;

  const start = Date.now();
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let exitCode = 0;

  try {
    for await (const message of query({
      prompt: fullPrompt,
      options: {
        permissionMode: 'default',
        canUseTool: opts.onPermissionRequest
          ? async (toolName, input) => {
              const approved = await opts.onPermissionRequest!({ toolName, input });
              return approved
                ? { behavior: 'allow', updatedInput: input }
                : { behavior: 'deny', message: 'Negado pelo usuário no orchestrator' };
            }
          : undefined
      }
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        opts.onEvent?.({ model: message.model });
      } else if (message.type === 'assistant') {
        const usage = message.message.usage;
        const content = Array.isArray(message.message.content) ? message.message.content : [];
        const toolUse = content.find((c: any) => c.type === 'tool_use');
        if (usage?.input_tokens != null) inputTokens = usage.input_tokens;
        if (usage?.output_tokens != null) outputTokens = usage.output_tokens;
        opts.onEvent?.({
          model: message.message.model,
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
          toolName: (toolUse as any)?.name
        });
      } else if (message.type === 'result') {
        exitCode = message.is_error ? 1 : 0;
        if (message.usage) {
          inputTokens = message.usage.input_tokens ?? inputTokens;
          outputTokens = message.usage.output_tokens ?? outputTokens;
        }
      }
    }
  } catch {
    exitCode = 1;
  }

  return { exitCode, inputTokens, outputTokens, durationMs: Date.now() - start };
}
