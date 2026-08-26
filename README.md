# CLI-IA-Orchestrator

Multi-agent CLI orchestrator (RFC 0001) — roteia tarefas para `claude`, `opencode` e `agy`.

## Setup

```sh
npm install
npm link   # instala `orchestrator` no PATH
```

## Uso

```sh
orchestrator --version

# Roteamento semântico via OmniRoute (com fallback determinístico automático)
orchestrator run "documentar a API de billing"     # → claude -p
orchestrator run "refatorar o módulo de pagamentos" # → agy -p
orchestrator run "criar script de deploy"           # → opencode run

# Override manual de agente
orchestrator run "<tarefa>" --agent open-code

# Forçar apenas regras determinísticas (sem chamar LLM/OmniRoute)
orchestrator run "<tarefa>" --no-classifier
```

## Configuração do OmniRoute (Fase 2 - RFC 0004)

O roteador tenta primeiro classificar a tarefa semanticamente via OmniRoute (Anthropic Messages API `/v1/messages`). Em caso de falha de rede, timeout ou erro de API, ele cai imediatamente no fallback determinístico da Fase 1 sem travar o comando.

A configuração pode ser fornecida de três formas (em ordem de prioridade):

### 1. Flags CLI
```sh
orchestrator run "minha tarefa" \
  --omniroute-url "http://localhost:20128" \
  --omniroute-token "meu-token" \
  --omniroute-model "combo/nome-do-combo"
```

### 2. Variáveis de Ambiente
```sh
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="meu-token"
export ANTHROPIC_MODEL="combo/nome-do-combo"

# Ou usando prefixo OMNIROUTE_:
export OMNIROUTE_BASE_URL="http://localhost:20128"
export OMNIROUTE_AUTH_TOKEN="meu-token"
export OMNIROUTE_MODEL="combo/nome-do-combo"
```

### 3. Arquivo `Settings.local.json`
Compatível com o formato padrão do Claude Code:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "Seu token",
    "ANTHROPIC_MODEL": "combo/nome-do-combo"
  }
}
```

## Desenvolvimento e Testes

```sh
# Executar testes unitários e de aceitação
npm test

# Build do TypeScript
npm run build

# Execução em desenvolvimento via tsx
npm run dev -- run "sua tarefa aqui"
```