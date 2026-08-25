#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const AGENTS = ['claude', 'opencode', 'agy'];

const HELP = `orchestrator - multi-agent CLI orchestrator (RFC 0001)

Usage:
  orchestrator --version   show version
  orchestrator --help      show this help

Routing commands arrive in Phase 1.`;

function version(): string {
  return require('../package.json').version;
}

function missingAgents(): string[] {
  return AGENTS.filter((name) => spawnSync('which', [name], { stdio: 'ignore' }).status !== 0);
}

function main(argv: string[]): void {
  const [arg] = argv;
  if (arg === '--version' || arg === '-v') {
    console.log(version());
    return;
  }
  if (arg === '--help' || arg === '-h' || arg === undefined) {
    console.log(HELP);
    return;
  }
  const missing = missingAgents();
  if (missing.length > 0) {
    console.warn(`warning: agents not found in PATH: ${missing.join(', ')}`);
  }
  console.log(`unknown command: ${arg}`);
  console.log(HELP);
  process.exitCode = 1;
}

main(process.argv.slice(2));