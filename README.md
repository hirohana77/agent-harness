# agent-harness

> Deterministic execution, sandbox evaluation, and trajectory verification harness for autonomous AI agents.

[![npm version](https://img.shields.io/npm/v/agent-harness.svg)](https://www.npmjs.com/package/agent-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

[English](README.md) | [中文说明](README_ZH.md)

---

## Highlights

- **Isolated Sandbox**: Dynamically provisions ephemeral workspaces with git baseline snapshots and strict path confinement.
- **Security Guardrails**: Enforces command pattern blacklists and prevents host traversal attacks.
- **Deterministic Trajectories**: Captures step-by-step agent turns, tool calls, token usage, latency, and costs.
- **Offline Trajectory Replay**: Re-executes recorded trajectories against workspaces without consuming LLM API tokens.
- **Multi-faceted Verification**: Asserts file system state, test suite exit codes, and agent behavioral constraints.
- **Rich Reporting**: Beautiful terminal summaries, GitHub-flavored Markdown tables, and machine-readable JSON metrics.
- **Headless & CI-Ready**: Programmatic TypeScript SDK and standalone CLI for automated evaluation pipelines.

---

## Installation


added 1 package in 1s
 ERR_PNPM_NO_GLOBAL_BIN_DIR  Unable to find the global bin directory

Run "pnpm setup" to create it automatically, or set the global-bin-dir setting, or the PNPM_HOME env variable. The global bin directory should be in the PATH.
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +1
+
Progress: resolved 1, reused 0, downloaded 1, added 1, done

dependencies:
+ agent-harness 0.0.1

Done in 1s using pnpm v9.15.9

---

## Quick Start (CLI)

### 1. Scaffold a Scenario


### 2. Validate Scenario Configuration


### 3. Run Scenario with an Agent Command


### 4. Deterministic Replay


---

## Programmatic TypeScript SDK



---

## Scenario Specification



---

## License

MIT (c) 2026 hirohana77
