#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { TaskRouter } from './router';
import { AgentExitError, AgentRunner } from './adapters/agentRunner';

const AGENT_NAMES = Object.keys(AgentRunner.commands);

function version(): string {
  return require('../package.json').version;
}

function hasBinary(name: string): boolean {
  return spawnSync('which', [name], { stdio: 'ignore' }).status === 0;
}

const program = new Command();

program
  .name('orchestrator')
  .description('Multi-agent CLI orchestrator (RFC 0001)')
  .version(version(), '-v, --version');

program
  .command('run <task>')
  .description('Rota uma tarefa por keyword e executa o agente escolhido')
  .option('-a, --agent <name>', `override manual (${AGENT_NAMES.join(' | ')})`)
  .action(async (task: string, opts: { agent?: string }) => {
    let agent: string;
    if (opts.agent) {
      if (!AgentRunner.commands[opts.agent]) {
        console.error(`agente inválido: ${opts.agent} (use ${AGENT_NAMES.join(', ')})`);
        process.exit(1);
      }
      agent = opts.agent;
    } else {
      const evaluation = TaskRouter.routeTask(task);
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