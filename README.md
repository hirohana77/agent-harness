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
- **Real-Time Streaming Event Bus**: Zero-overhead pub/sub architecture supporting wildcard subscriptions (`tool:*`, `*`), live observers, and async event dispatching.
- **Streaming Telemetry Observers**: Built-in `LiveConsoleObserver` for real-time terminal feedback, `JsonLinesStreamObserver` for streaming NDJSON persistence, and `BufferedStreamObserver` for replay.
- **Offline Trajectory Replay**: Re-executes recorded trajectories against workspaces without consuming LLM API tokens.
- **Multi-faceted Verification**: Asserts file system state, test suite exit codes, and agent behavioral constraints.
- **Virtual Tool Dispatcher & Mock Engine**: Native workspace tools combined with mock tool registries and expectation assertions.
- **Rich Reporting**: Beautiful terminal summaries, GitHub-flavored Markdown tables, and machine-readable JSON metrics.
- **Headless & CI-Ready**: Programmatic TypeScript SDK and standalone CLI for automated evaluation pipelines.

---

## Installation

```bash
# Global CLI installation
pnpm add -g agent-harness
# or npm
npm install -g agent-harness

# As a project dependency
pnpm add agent-harness
```

---

## Quick Start (CLI)

### 1. Scaffold a Scenario
```bash
agent-harness init --output ./scenario.yaml
```

### 2. Validate Scenario Configuration
```bash
agent-harness validate --scenario ./scenario.yaml
```

### 3. Run Scenario with Real-Time Streaming
```bash
agent-harness run \
  --scenario ./scenario.yaml \
  --command "npm test" \
  --live \
  --stream-jsonl ./events.jsonl \
  --report-json ./report.json \
  --report-md ./report.md \
  --save-trajectory ./trajectory.json
```

### 4. Deterministic Replay
```bash
agent-harness replay \
  --scenario ./scenario.yaml \
  --trajectory ./trajectory.json
```

---

## Real-Time Streaming Trajectory Event Bus

The harness provides an asynchronous, non-blocking telemetry event bus to observe agent turns, tool executions, and budget constraints as they happen.

```typescript
import {
  AgentHarness,
  TrajectoryEventBus,
  LiveConsoleObserver,
  JsonLinesStreamObserver,
  BufferedStreamObserver
} from 'agent-harness';

const eventBus = new TrajectoryEventBus();

// Listen to specific patterns or wildcards
eventBus.on('tool:*', (event) => {
  console.log(`Tool activity: ${event.type} -> ${event.toolName}`);
});

eventBus.on('budget:warning', (warning) => {
  console.warn(`Budget alert: ${warning.message}`);
});

// Run scenario with live observers
const bufferObserver = new BufferedStreamObserver({ maxSize: 500 });
const jsonlObserver = new JsonLinesStreamObserver('./stream.jsonl');
const liveConsole = new LiveConsoleObserver({ verbose: true });

const { report, trajectory } = await AgentHarness.runScenario(
  scenarioDefinition,
  async (ctx) => {
    ctx.recorder.startTurn('Diagnose the failed build');
    
    const result = await ctx.tools.call('exec_command', { command: 'npm test' });
    
    ctx.recorder.completeTurn('Diagnosis completed', {
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
    });
  },
  {
    eventBus,
    observers: [bufferObserver, jsonlObserver, liveConsole],
  }
);
```

---

## Architecture Specification

For an in-depth dive into the internal design, sandbox boundaries, trajectory model, and event bus lifecycle, see [docs/architecture.md](docs/architecture.md).

---

## License

MIT (c) 2026 hirohana77
