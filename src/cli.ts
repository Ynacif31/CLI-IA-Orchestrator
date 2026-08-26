#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { TaskRouter } from './router';
import { OmniRouteClassifier } from './classifiers/omniRouteClassifier';
import { AgentExitError, AgentRunner } from './adapters/agentRunner';

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
  .action(async (task: string, opts: {
    agent?: string;
    omnirouteUrl?: string;
    omnirouteToken?: string;
    omnirouteModel?: string;
    classifier?: boolean;
  }) => {
    let agent: string;
    if (opts.agent) {
      if (!AgentRunner.commands[opts.agent]) {
        console.error(`agente inválido: ${opts.agent} (use ${AGENT_NAMES.join(', ')})`);
        process.exit(1);
      }
      agent = opts.agent;
    } else {
      let evaluation;
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

    try {
      await AgentRunner.execute(agent, task);
    } catch (err) {
      if (err instanceof AgentExitError) {
        console.error(err.message);
        process.exitCode = err.exitCode;
      } else {
        console.error(`erro ao executar ${agent}: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    }
  });

program.parse(process.argv);