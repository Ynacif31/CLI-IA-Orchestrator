#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { TaskRouter } from './router.js';
import { OmniRouteClassifier } from './classifiers/omniRouteClassifier.js';
import { AgentRunner } from './adapters/agentRunner.js';
import { ObsidianMcpBridge } from './mcp/obsidianClient.js';
import { resolveObsidianConfig } from './config.js';
import { recordUsage } from './usage.js';
import type { TaskEvaluation } from './types.js';
import { startInteractiveUI } from './ui/index.js';

const AGENT_NAMES = Object.keys(AgentRunner.commands);

function getVersion(): string {
  return '0.1.0';
}

function hasBinary(name: string): boolean {
  return spawnSync('which', [name], { stdio: 'ignore' }).status === 0;
}

const program = new Command();

program
  .name('orchestrator')
  .description('Multi-agent CLI orchestrator (RFC 0001)')
  .version(getVersion(), '-v, --version')
  .option('-i, --interactive', 'abre a interface interativa de terminal (Ink)')
  .action(async (opts) => {
    // If orchestrator is called with no subcommand, open interactive UI in TTY or if requested
    if (process.stdout.isTTY || opts.interactive) {
      await startInteractiveUI();
    } else {
      program.help();
    }
  });

program
  .command('ui')
  .description('Abre a interface gráfica de terminal interativa (Ink)')
  .action(async () => {
    await startInteractiveUI();
  });

program
  .command('run <task>')
  .description('Rota uma tarefa por classificação semântica/keyword e executa o agente escolhido')
  .option('-a, --agent <name>', `override manual (${AGENT_NAMES.join(' | ')})`)
  .option('--omniroute-url <url>', 'URL base do OmniRoute (ex: http://localhost:20128)')
  .option('--omniroute-token <token>', 'Token de autenticação do OmniRoute')
  .option('--omniroute-model <model>', 'Modelo ou combo do OmniRoute (ex: combo/meu-combo)')
  .option('--no-classifier', 'desativa o classificador semântico e usa apenas regras determinísticas')
  .option('--obsidian-cmd <cmd>', 'comando do servidor MCP Obsidian')
  .option('--obsidian-args <args...>', 'argumentos do servidor MCP Obsidian')
  .option('--no-obsidian', 'desativa a integração com Obsidian MCP')
  .action(async (task: string, opts: {
    agent?: string;
    omnirouteUrl?: string;
    omnirouteToken?: string;
    omnirouteModel?: string;
    classifier?: boolean;
    obsidianCmd?: string;
    obsidianArgs?: string[];
    obsidian?: boolean;
  }) => {
    let agent: string;
    let evaluation: TaskEvaluation;

    if (opts.agent) {
      if (!AgentRunner.commands[opts.agent]) {
        console.error(`agente inválido: ${opts.agent} (use ${AGENT_NAMES.join(', ')})`);
        process.exit(1);
      }
      agent = opts.agent;
      evaluation = {
        agent: agent as any,
        reason: 'Seleção manual de agente via flag --agent',
        estimatedComplexity: 'medium',
        source: 'manual'
      };
    } else {
      if (opts.classifier === false) {
        evaluation = TaskRouter.routeDeterministic(task);
        console.error(`[router] Classificador desativado manualmente. Usando fallback determinístico.`);
      } else {
        const classifier = new OmniRouteClassifier({
          baseUrl: opts.omnirouteUrl,
          authToken: opts.omnirouteToken,
          model: opts.omnirouteModel
        });
        evaluation = await TaskRouter.routeTask(task, classifier);
      }
      agent = evaluation.agent;
      console.error(`→ ${agent} (${evaluation.estimatedComplexity}): ${evaluation.reason}`);
    }

    const { cmd } = AgentRunner.commands[agent];
    if (!hasBinary(cmd)) {
      console.error(`erro: binário '${cmd}' não encontrado no PATH`);
      process.exit(1);
    }

    // Obsidian MCP Integration (RFC 0005)
    const obsidianBridge = new ObsidianMcpBridge();
    let obsidianContext = '';

    if (opts.obsidian !== false) {
      const obsidianConfig = resolveObsidianConfig({
        command: opts.obsidianCmd,
        args: opts.obsidianArgs
      });

      if (obsidianConfig.command) {
        try {
          await obsidianBridge.connect(obsidianConfig.command, obsidianConfig.args || []);
          console.error(`[obsidian] Conectado ao servidor MCP (${obsidianConfig.command})`);
          obsidianContext = await obsidianBridge.getContextNotes(task);
          if (obsidianContext) {
            console.error(`[obsidian] Contexto recuperado do vault (${obsidianContext.length} caracteres)`);
          }
        } catch (err: any) {
          console.error(`[obsidian] Aviso: Não foi possível conectar ao servidor MCP: ${err.message}`);
        }
      }
    }

    const startTime = Date.now();
    let exitCode = 0;
    let durationMs = 0;
    let totalTokens = 0;

    try {
      const runResult = await AgentRunner.execute(agent, task, { context: obsidianContext });
      exitCode = runResult.exitCode ?? 0;
      durationMs = runResult.durationMs;
      totalTokens = (runResult.inputTokens ?? 0) + (runResult.outputTokens ?? 0);
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    } catch (err: any) {
      console.error(`erro ao executar ${agent}: ${err.message}`);
      exitCode = 1;
      process.exitCode = 1;
      durationMs = Date.now() - startTime;
    } finally {
      recordUsage(agent, durationMs, totalTokens);

      if (obsidianBridge.isConnected()) {
        try {
          const logPath = await obsidianBridge.createTaskLog({
            agent,
            task,
            reason: evaluation.reason,
            estimatedComplexity: evaluation.estimatedComplexity,
            exitCode,
            durationMs
          });

          if (logPath) {
            console.error(`[obsidian] Log registrado em ${logPath}`);
          }
        } catch (err: any) {
          console.error(`[obsidian] Aviso: Falha ao registrar log no vault: ${err.message}`);
        } finally {
          await obsidianBridge.disconnect().catch(() => {});
        }
      }
    }
  });

program.parse(process.argv);