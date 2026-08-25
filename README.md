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
orchestrator --help
```

Dev loop: `npm run dev -- <args>` (tsx). Build de release: `npm run build` (tsc).

Fase 0 concluída — roteamento chega na Fase 1 (RFC 0003).