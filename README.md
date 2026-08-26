# CLI-IA-Orchestrator

Multi-agent CLI orchestrator (RFC 0001) — roteia tarefas para `claude`, `opencode` e `agy`.

## Setup

```sh
npm install
npm link   # instala `orchestrator` no PATH
```

## Uso

### 1. Modo Interativo / UI de Terminal (Fase 5 - RFC 0007)
Ao executar sem argumentos em um terminal interativo (TTY), ou com a flag `-i`/`--interactive`, ou pelo comando `ui`, o Orchestrator abre uma interface interativa rica construída com **Ink (React para Terminal)**:

```sh
orchestrator          # abre a UI interativa no terminal
orchestrator ui       # comando explícito para a UI
orchestrator -i       # flag de modo interativo
```

**Recursos da UI Interativa**:
- ✍️ Entrada interativa de tarefas
- 🎯 Visualização da sugestão do roteador com complexidade e motivo
- 🔄 Seleção / confirmação do agente com navegação por setas e Enter
- ⏳ Barra de status e spinners durante chamadas MCP e execução de subprocessos
- 📊 Painel de consumo e atividade integrado (lendo `usage.json`)

---

### 2. Modo Não-Interativo (Scripts, Pipes e Automação)
Para pipelines de CI/CD, scripts bash e uso direto sem UI gráfica de terminal:

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

# Desativar integração com Obsidian MCP
orchestrator run "<tarefa>" --no-obsidian
```

---

## Configuração do OmniRoute (Fase 2 - RFC 0004)

O roteador tenta primeiro classificar a tarefa semanticamente via OmniRoute (Anthropic Messages API `/v1/messages`). Em caso de falha de rede, timeout ou erro de API, ele cai imediatamente no fallback determinístico da Fase 1 sem travar o comando.

### Formas de Configuração:

1. **Flags CLI**: `--omniroute-url`, `--omniroute-token`, `--omniroute-model`
2. **Variáveis de Ambiente**: `ANTHROPIC_BASE_URL` (ou `OMNIROUTE_BASE_URL`), `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`
3. **Arquivo `Settings.local.json`**:
   ```json
   {
     "env": {
       "ANTHROPIC_BASE_URL": "http://localhost:20128",
       "ANTHROPIC_AUTH_TOKEN": "Seu token",
       "ANTHROPIC_MODEL": "combo/nome-do-combo"
     }
   }
   ```

---

## Integração MCP Obsidian (Fase 3 - RFC 0005)

Fornece contexto do vault para o agente antes da execução e registra um log por task pós-execução.

- **Pré-execução**: Busca notas relevantes via `search_notes` / `search_files` e anexa ao prompt como `[Contexto Obsidian]`.
- **Pós-execução**: Cria automaticamente uma nota em `Daily/AgentLogs/YYYY-MM-DDTHH-mm-ss - agent-run.md` com frontmatter, tag `#agent-run`, agente utilizado, complexidade estimada, motivo, exit code, duração e prompt truncado.
- **Resiliência Total**: Se o servidor MCP não estiver rodando ou falhar, a tarefa executa normalmente sem bloquear.

### Configuração do MCP Obsidian:

1. **Arquivo `Settings.local.json` / `.claude/settings.json`**:
   ```json
   {
     "obsidian": {
       "command": "npx",
       "args": ["-y", "mcp-obsidian", "/caminho/do/vault"]
     }
   }
   ```
   ou no formato `mcpServers`:
   ```json
   {
     "mcpServers": {
       "obsidian": {
         "command": "node",
         "args": ["/caminho/para/obsidian-mcp/index.js"]
       }
     }
   }
   ```

2. **Variáveis de Ambiente**:
   ```sh
   export OBSIDIAN_MCP_COMMAND="npx"
   export OBSIDIAN_MCP_ARGS="-y mcp-obsidian /caminho/do/vault"
   ```

3. **Flags CLI**:
   ```sh
   orchestrator run "minha tarefa" --obsidian-cmd "npx" --obsidian-args "-y" "mcp-obsidian" "/caminho/do/vault"
   ```

---

## Controle de Custo e Configuração (Fase 4 - RFC 0006)

Cada execução registra uma entrada em `~/.orchestrator/usage.json` (timestamp, agente, tokens de entrada/saída quando o CLI expõe — claude/agy via `--output-format json` — e duração). Estado de runtime fica fora do repositório, por decisão da RFC 0001.

```sh
orchestrator usage                          # hoje/mês/total + distribuição por agente + alerta de threshold
orchestrator config                         # mostra/edita ~/.orchestrator/config.yaml (cria com defaults)
orchestrator config get threshold
orchestrator config set threshold 50000
orchestrator config set agents.agy.cmd /caminho/para/agy
orchestrator config set routing.deploy open-code
```

O `config.yaml` também aceita edição manual (lida em runtime, sem rebuild). Regras de `routing` (keyword → agente) têm precedência sobre o classificador e as regras fixas; `agents.<nome>.cmd` sobrescreve o binário usado na execução.

---

## Desenvolvimento e Testes

```sh
# Executar suíte de testes unitários e de aceitação
npm test

# Build do TypeScript
npm run build

# Execução em desenvolvimento via tsx
npm run dev -- run "sua tarefa aqui"
```