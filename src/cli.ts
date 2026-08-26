#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { TaskRouter } from './router';
import { OmniRouteClassifier } from './classifiers/omniRouteClassifier';
import { AgentRunner, RunResult } from './adapters/agentRunner';
import { ObsidianMcpBridge } from './mcp/obsidianClient';
import {
  resolveObsidianConfig,
  loadConfig,
  saveConfig,
  dumpConfig,
  getConfigValue,
  setConfigValue,
  coerceValue,
  CONFIG_FILE
} from './config';
import { recordUsage, printUsageReport } from './usage';
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
    const cfg = loadConfig();

    let agent: string;
    let evaluation: TaskEvaluation;

    if (opts.agent) {
      if (!AgentRunner.commands[opts.agent]) {
        console.error(`agente inválido: ${opts.agent} (use ${AGENT_NAMES.join(', ')})`);
        process.exit(1);
      }
      agent = opts.agent;
      evaluation = {
        agent: agent as TaskEvaluation['agent'],
        reason: 'Seleção manual de agente via flag --agent',
        estimatedComplexity: 'medium',
        source: 'manual'
      };
    } else {
      const custom = TaskRouter.routeCustom(task, cfg.routing);
      if (custom) {
        if (!AgentRunner.commands[custom.agent]) {
          console.error(`agente inválido na regra customizada: ${custom.agent}`);
          process.exit(1);
        }
        evaluation = custom;
      } else if (opts.classifier === false) {
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

    const cmd = cfg.agents[agent]?.cmd ?? AgentRunner.commands[agent].cmd;
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

    let result: RunResult;
    try {
      result = await AgentRunner.execute(agent, task, { cmd, context: obsidianContext });
    } catch (err) {
      console.error(`erro ao executar ${agent}: ${(err as Error).message}`);
      result = { exitCode: 1, inputTokens: null, outputTokens: null, durationMs: 0 };
    }

    const exitCode = result.exitCode ?? 1;
    if (exitCode !== 0) {
      console.error(`Agente ${agent} finalizou com código de saída ${exitCode}`);
    }
    process.exitCode = exitCode;

    recordUsage({
      timestamp: new Date().toISOString(),
      agent,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs
    });

    if (obsidianBridge.isConnected()) {
      try {
        const logPath = await obsidianBridge.createTaskLog({
          agent,
          task,
          reason: evaluation.reason,
          estimatedComplexity: evaluation.estimatedComplexity,
          exitCode,
          durationMs: result.durationMs
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
  });

program
  .command('usage')
  .description('Mostra consumo do dia/mês e alerta se passar do limite configurado')
  .action(() => {
    printUsageReport(loadConfig().threshold);
  });

program
  .command('config')
  .description('Mostra a configuração (cria ~/.orchestrator/config.yaml se ausente); use "config get <chave>" ou "config set <chave> <valor>"')
  .argument('[op]', 'get | set')
  .argument('[key]', 'chave em dot-path, ex: agents.agy.cmd, routing.deploy, threshold')
  .argument('[value]', 'valor (apenas no set)')
  .action((op: string | undefined, key: string | undefined, value: string | undefined) => {
    const cfg = loadConfig();
    if (op === 'get') {
      if (!key) {
        console.error('uso: orchestrator config get <chave>');
        process.exit(1);
      }
      const found = getConfigValue(cfg, key);
      console.log(found === undefined ? '' : typeof found === 'object' ? JSON.stringify(found) : String(found));
      return;
    }
    if (op === 'set') {
      if (!key || value === undefined) {
        console.error('uso: orchestrator config set <chave> <valor>');
        process.exit(1);
      }
      setConfigValue(cfg, key, coerceValue(value));
      saveConfig(cfg);
      console.log('ok');
      return;
    }
    if (op !== undefined) {
      console.error(`operação desconhecida: ${op} (use get | set)`);
      process.exit(1);
    }
    saveConfig(cfg);
    console.log(`config: ${CONFIG_FILE}`);
    console.log(dumpConfig(cfg));
  });

program.parse(process.argv);