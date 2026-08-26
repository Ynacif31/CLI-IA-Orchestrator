#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { TaskRouter } from './router';
import { OmniRouteClassifier } from './classifiers/omniRouteClassifier';
import { AgentExitError, AgentRunner } from './adapters/agentRunner';
import { ObsidianMcpBridge } from './mcp/obsidianClient';
import { resolveObsidianConfig } from './config';
import { TaskEvaluation } from './types';

const AGENT_NAMES = Object.keys(AgentRunner.commands);

function getVersion(): string {
  try {
    return require('../package.json').version;
  } catch {
    return '0.1.0';
  }
}

function hasBinary(name: string): boolean {
  return spawnSync('which', [name], { stdio: 'ignore' }).status === 0;
}

const program = new Command();

program
  .name('orchestrator')
  .description('Multi-agent CLI orchestrator (RFC 0001)')
  .version(getVersion(), '-v, --version');

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

    try {
      await AgentRunner.execute(agent, task, obsidianContext);
    } catch (err) {
      if (err instanceof AgentExitError) {
        console.error(err.message);
        exitCode = err.exitCode;
        process.exitCode = err.exitCode;
      } else {
        console.error(`erro ao executar ${agent}: ${(err as Error).message}`);
        exitCode = 1;
        process.exitCode = 1;
      }
    } finally {
      const durationMs = Date.now() - startTime;

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