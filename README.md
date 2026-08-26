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
orchestrator run "documentar a API de billing"     # → claude -p
orchestrator run "refatorar o módulo de pagamentos" # → agy -p
orchestrator run "criar script de deploy"           # → opencode run
orchestrator run "<tarefa>" --agent open-code       # override manual
```

Roteamento determinístico por keyword (RFC 0003). O exit code do agente propaga pro `orchestrator`.

Dev loop: `npm run dev -- run "<tarefa>"` (tsx). Build de release: `npm run build` (tsc).

Fase 1 concluída — classificador de IA chega na Fase 2.