import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { TaskRouter } from '../router.js';
import { AgentRunner } from '../adapters/agentRunner.js';
import { ObsidianMcpBridge } from '../mcp/obsidianClient.js';
import { resolveObsidianConfig } from '../config.js';
import { loadUsageStats, recordUsage, UsageStats } from '../usage.js';
import { AgentTarget, TaskEvaluation } from '../types.js';

type Step = 'input_task' | 'evaluating' | 'confirm_agent' | 'executing' | 'done';

const AGENT_OPTIONS = [
  { label: 'claude-code (Docs, Specs, READMEs)', value: 'claude-code' },
  { label: 'agy (Deep Engineering, Architecture, Refactor)', value: 'agy' },
  { label: 'open-code (General Coding, Scripts, Quick Tasks)', value: 'open-code' }
];

export function App() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('input_task');
  const [task, setTask] = useState('');
  const [evaluation, setEvaluation] = useState<TaskEvaluation | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentTarget>('open-code');
  const [statusMessage, setStatusMessage] = useState('');
  const [obsidianLogPath, setObsidianLogPath] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<{ exitCode: number; durationMs: number; error?: string } | null>(null);
  const [usage, setUsage] = useState<UsageStats>(loadUsageStats());

  useEffect(() => {
    setUsage(loadUsageStats());
  }, [step]);

  const handleTaskSubmit = async (value: string) => {
    if (!value.trim()) return;
    setTask(value.trim());
    setStep('evaluating');

    try {
      const evalResult = await TaskRouter.routeTask(value.trim());
      setEvaluation(evalResult);
      setSelectedAgent(evalResult.agent);
      setStep('confirm_agent');
    } catch {
      const fallback = TaskRouter.routeDeterministic(value.trim());
      setEvaluation(fallback);
      setSelectedAgent(fallback.agent);
      setStep('confirm_agent');
    }
  };

  const handleAgentSelect = async (item: { value: string }) => {
    const agent = item.value as AgentTarget;
    setSelectedAgent(agent);
    setStep('executing');
    await runAgentTask(agent, task, evaluation);
  };

  const runAgentTask = async (agent: AgentTarget, taskText: string, evalObj: TaskEvaluation | null) => {
    const obsidianBridge = new ObsidianMcpBridge();
    let obsidianContext = '';
    const obsidianConfig = resolveObsidianConfig();

    if (obsidianConfig.command) {
      try {
        setStatusMessage(`Conectando ao Obsidian MCP (${obsidianConfig.command})...`);
        await obsidianBridge.connect(obsidianConfig.command, obsidianConfig.args || []);
        setStatusMessage('Buscando notas contextuais no vault...');
        obsidianContext = await obsidianBridge.getContextNotes(taskText);
      } catch {
        // Continue silently without context
      }
    }

    setStatusMessage(`Executando agente ${agent}...`);
    const startTime = Date.now();
    let exitCode = 0;
    let durationMs = 0;
    let totalTokens = 0;
    let errorMsg: string | undefined;

    try {
      const runResult = await AgentRunner.execute(agent, taskText, { context: obsidianContext });
      exitCode = runResult.exitCode ?? 0;
      durationMs = runResult.durationMs;
      totalTokens = (runResult.inputTokens ?? 0) + (runResult.outputTokens ?? 0);
    } catch (err: any) {
      exitCode = 1;
      errorMsg = err.message || 'Erro desconhecido';
      durationMs = Date.now() - startTime;
    }

    recordUsage(agent, durationMs, totalTokens);

    if (obsidianBridge.isConnected()) {
      try {
        setStatusMessage('Registrando log no vault Obsidian...');
        const logPath = await obsidianBridge.createTaskLog({
          agent,
          task: taskText,
          reason: evalObj?.reason || 'Seleção manual de agente',
          estimatedComplexity: evalObj?.estimatedComplexity || 'medium',
          exitCode,
          durationMs
        });
        setObsidianLogPath(logPath);
      } catch {}
      await obsidianBridge.disconnect().catch(() => {});
    }

    setExecutionResult({ exitCode, durationMs, error: errorMsg });
    setStep('done');
  };

  const handleRestart = () => {
    setTask('');
    setEvaluation(null);
    setSelectedAgent('open-code');
    setStatusMessage('');
    setObsidianLogPath(null);
    setExecutionResult(null);
    setStep('input_task');
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">
          🚀 Multi-Agent CLI Orchestrator (RFC 0001 / RFC 0007)
        </Text>
        <Text color="gray">Roteamento semântico de tarefas para Claude Code, OpenCode e Antigravity (AGY)</Text>
      </Box>

      {/* Usage / Cost Panel */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color="yellow">📊 Painel de Consumo & Atividade (usage.json)</Text>
        <Box gap={2}>
          <Text>Tarefas executadas: <Text bold color="green">{usage.totalTasks}</Text></Text>
          {usage.totalTokens > 0 && (
            <Text>Tokens totais: <Text bold color="magenta">{usage.totalTokens.toLocaleString()}</Text></Text>
          )}
          {usage.totalDurationMs > 0 && (
            <Text>Tempo acumulado: <Text bold color="blue">{(usage.totalDurationMs / 1000).toFixed(1)}s</Text></Text>
          )}
        </Box>
        {Object.keys(usage.agentBreakdown).length > 0 && (
          <Text color="gray">
            Uso por agente: {Object.entries(usage.agentBreakdown).map(([k, v]) => `${k}: ${v}`).join(' | ')}
          </Text>
        )}
      </Box>

      {/* Interactive Step Content */}
      {step === 'input_task' && (
        <Box flexDirection="column">
          <Text bold color="white">
            ✍️ Digite a tarefa a ser executada:
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">❯ </Text>
            <TextInput
              value={task}
              onChange={setTask}
              onSubmit={handleTaskSubmit}
              placeholder="Ex: refatorar a camada de autenticação ou criar docs da API..."
            />
          </Box>
        </Box>
      )}

      {step === 'evaluating' && (
        <Box marginY={1}>
          <Text color="yellow">
            <Spinner type="dots" /> Roteando tarefa via classificador semântico OmniRoute...
          </Text>
        </Box>
      )}

      {step === 'confirm_agent' && evaluation && (
        <Box flexDirection="column">
          <Box flexDirection="column" marginBottom={1} padding={1} borderStyle="classic" borderColor="green">
            <Text bold color="green">
              🎯 Sugestão do Roteador: <Text color="white" bold>{evaluation.agent}</Text> ({evaluation.estimatedComplexity} complexidade)
            </Text>
            <Text color="gray">Motivo: {evaluation.reason}</Text>
            <Text color="gray">Fonte da decisão: {evaluation.source === 'classifier' ? 'Classificador Semântico OmniRoute' : 'Fallback Determinístico'}</Text>
          </Box>

          <Text bold color="white">
            Selecione o agente para executar (pressione Enter para confirmar a recomendação ou trocar):
          </Text>
          <Box marginTop={1}>
            <SelectInput
              items={AGENT_OPTIONS}
              initialIndex={AGENT_OPTIONS.findIndex((o) => o.value === selectedAgent) !== -1 ? AGENT_OPTIONS.findIndex((o) => o.value === selectedAgent) : 0}
              onSelect={handleAgentSelect}
            />
          </Box>
        </Box>
      )}

      {step === 'executing' && (
        <Box flexDirection="column" marginY={1}>
          <Text color="cyan">
            <Spinner type="dots" /> {statusMessage}
          </Text>
          <Text color="gray">Agente alvo: {selectedAgent}</Text>
          <Text color="gray">Tarefa: {task}</Text>
        </Box>
      )}

      {step === 'done' && executionResult && (
        <Box flexDirection="column">
          {executionResult.exitCode === 0 ? (
            <Text bold color="green">
              ✅ Tarefa concluída com sucesso em {(executionResult.durationMs / 1000).toFixed(2)}s!
            </Text>
          ) : (
            <Text bold color="red">
              ❌ Execução finalizada com erro (código de saída {executionResult.exitCode}): {executionResult.error}
            </Text>
          )}

          {obsidianLogPath && (
            <Text color="blue">
              📝 Nota registrada no Obsidian: {obsidianLogPath}
            </Text>
          )}

          <Box marginTop={1} gap={2}>
            <Text color="gray">
              Pressione <Text bold color="cyan">[Enter]</Text> para nova tarefa ou <Text bold color="red">[Ctrl+C]</Text> para sair.
            </Text>
          </Box>
          <TextInput value="" onChange={() => {}} onSubmit={handleRestart} />
        </Box>
      )}
    </Box>
  );
}
