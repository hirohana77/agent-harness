# agent-harness

> Deterministic execution, sandbox evaluation, and trajectory verification harness for autonomous AI agents.

[![npm version](https://img.shields.io/npm/v/agent-harness.svg)](https://www.npmjs.com/package/agent-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

[English](README.md) | [中文说明](README_ZH.md)

---

## Highlights

- **Pluggable Sandbox Backends**: Run benchmarks in lightweight local temporary environments or fully virtualized **Docker / Podman** containers with cgroups resource limits and network isolation.
- **SWE-bench Task Adapter & Evaluation Engine**: Seamlessly import SWE-bench, SWE-bench Lite, and SWE-bench Verified tasks from JSONL; automatically bind container images, inject `FAIL_TO_PASS` and `PASS_TO_PASS` test assertions, and compute standard resolution rates.
- **Isolated Workspace**: Dynamically provisions ephemeral workspaces with git baseline snapshots and strict path confinement.
- **Security Guardrails**: Enforces command pattern blacklists and prevents host traversal attacks.
- **Deterministic Trajectories**: Captures step-by-step agent turns, tool calls, token usage, latency, and costs.
- **Real-Time Streaming Event Bus**: Zero-overhead pub/sub architecture supporting wildcard subscriptions (`tool:*`, `*`), live observers, and async event dispatching.
- **Streaming Telemetry Observers**: Built-in `LiveConsoleObserver` for real-time terminal feedback, `JsonLinesStreamObserver` for streaming NDJSON persistence, and `BufferedStreamObserver` for replay.
- **Interactive Steering & Breakpoint Debugger (HITL)**: Dynamic conditional breakpoints (`tool` regex, `error_count`, `turn`, `budget_ratio`). Suspend execution asynchronously, inject corrective guidance prompts, override tool returns, skip calls, or safely abort runs via Live Web Dashboard, CLI, or RESTful control APIs.
- **Live Web Dashboard & SSE Telemetry**: Embedded, zero-dependency real-time browser dashboard and HTTP/SSE streaming server. Live execution timeline, tool call inspection, KPI counters, ring buffer replay via `Last-Event-ID`, and RESTful status endpoints.
- **Offline Trajectory Replay**: Re-executes recorded trajectories against workspaces without consuming LLM API tokens.
- **AST Semantic Code Verification**: Compiler-level TypeScript/JavaScript structural analysis. Assert functions, class hierarchies, interfaces, type aliases, module imports/exports, anti-patterns (`eval`, `debugger`, `console`, `any`, `var`, empty catch, nested ternaries), and cyclomatic complexity limits without regex brittleness.
- **Multi-faceted Verification**: Asserts file system state, AST semantic rules, test suite exit codes, and agent behavioral constraints.
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

## SWE-bench Dataset Integration & Evaluation

`agent-harness` provides end-to-end tooling to convert official SWE-bench JSONL task sets into harness evaluation suites and calculate resolved metrics.

### Inspect SWE-bench Dataset
```bash
agent-harness swebench info --input ./swe-bench-lite.jsonl
```

### Import Tasks into Harness Scenarios
```bash
agent-harness swebench import \
  --input ./swe-bench-lite.jsonl \
  --output ./scenarios/swebench/ \
  --format yaml \
  --sandbox docker \
  --image-prefix "swebench/sweb.eval.x86_64."
```

### Evaluate Agent Predictions
```bash
agent-harness swebench eval \
  --dataset ./swe-bench-lite.jsonl \
  --predictions ./predictions.json \
  --output ./swebench-summary.json
```

### Programmatic Benchmark Execution

```typescript
import { BenchmarkRunner, SWEBenchAdapter, SWEBenchEvaluator } from 'agent-harness';

// Run entire SWE-bench task set against an autonomous agent
const { summary, swebench } = await BenchmarkRunner.runSWEBench(
  {
    datasetPath: './swe-bench-lite.jsonl',
    concurrency: 4,
    adapterOptions: {
      sandboxBackend: 'docker',
      memoryLimit: '4g',
      cpuLimit: 2.0,
    },
  },
  async (ctx) => {
    // Agent execution loop
    ctx.recorder.startTurn('Resolving bug in target repository');
    await ctx.executor.execute('git apply eval_test.patch');
    ctx.recorder.completeTurn('Fix applied');
  }
);

console.log(`SWE-bench Resolved Rate: ${swebench.resolveRatePercent}%`);
console.log(`Passed: ${swebench.resolvedInstances} / ${swebench.totalInstances}`);
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

## Docker & Podman Container Sandboxing

For untrusted agent execution or strict multi-environment benchmarks (e.g. SWE-bench style tasks), `agent-harness` provides a fully virtualized container backend:

### Scenario Definition (`scenario.yaml`)
```yaml
id: docker-eval-demo
name: Docker Sandboxed Code Evaluation
sandbox:
  backend: docker             # "local" | "docker" | "podman"
  container:
    image: node:20-alpine
    network: none             # complete network isolation
    memoryLimit: 512m
    cpuLimit: 1.0
    pidsLimit: 100
    workdir: /workspace
task:
  instruction: Fix the regression and ensure tests pass
```

### CLI Container Flags
```bash
agent-harness run \
  --scenario ./scenario.yaml \
  --sandbox docker \
  --image python:3.11-slim \
  --container-network none \
  --command "pytest -v"
```

### Automatic Lifecycle & Orphan Prevention
- Workspaces on the host are automatically mounted into the container (`-v <hostPath>:<containerWorkdir>`).
- Built-in `ContainerProcessRegistry` ensures clean termination on process exit, `SIGINT`, or uncaught failures to guarantee zero orphaned containers.
- Automatic runtime probe checks daemon availability and seamlessly falls back or diagnoses connection issues.

## AST Semantic Code Verification

Evaluating code generated or refactored by autonomous agents using regular expressions or substring matching is notoriously brittle: formatting changes, comments, and stylistic variations often lead to false positives or false negatives.

`agent-harness` includes an AST-level semantic assertion engine powered by the TypeScript compiler API:

### Scenario Definition with AST Assertions (`scenario.yaml`)
```yaml
id: refactor-user-service
name: Refactor User Service to TypeScript
task:
  instruction: Convert src/user.js to TypeScript, export an interface, and ensure no console.log or any types remain.
assertions:
  ast:
    - path: "src/user.ts"
      rules:
        - rule: "has_interface"
          name: "IUserService"
          isExported: true
          properties:
            - name: "findById"
              optional: false
        - rule: "has_class"
          name: "UserService"
          isExported: true
          implementsInterfaces: ["IUserService"]
          methods:
            - name: "findById"
              isAsync: true
        - rule: "has_function"
          name: "validateUser"
          isExported: true
          minParams: 1
          maxParams: 2
          paramNames: ["user"]
        - rule: "no_forbidden_syntax"
          forbidden: ["eval", "debugger", "console", "any_type", "var_declaration", "empty_catch", "nested_ternary"]
        - rule: "complexity"
          maxCyclomaticComplexity: 10
          maxAstDepth: 25
```

### Programmatic SDK Usage
```typescript
import { ASTParser, ASTAnalyzer, ASTVerifier } from 'agent-harness';

// Direct AST analysis
const sourceFile = ASTParser.parse('src/math.ts', code);
const analyzer = new ASTAnalyzer(sourceFile);

const functions = analyzer.findFunctions();
const violations = analyzer.detectAntiPatterns(['eval', 'console', 'any_type']);
const complexity = analyzer.computeComplexity();

// High-level verification within workspace
const astVerifier = new ASTVerifier(workspace);
const results = await astVerifier.verify([
  {
    path: 'src/math.ts',
    rules: [
      { rule: 'has_function', name: 'calculateTotal', isAsync: true, isExported: true },
      { rule: 'no_forbidden_syntax', forbidden: ['any_type', 'var_declaration'] },
    ],
  },
]);
```

---

## Real-Time Web Telemetry & Live Dashboard (SSE)

`agent-harness` features an embedded, zero-dependency HTTP and Server-Sent Events (SSE) telemetry server with an interactive web dashboard. Monitor autonomous agent executions live in your browser with zero setup overhead:

### 1. Launch Standalone Telemetry Server
```bash
agent-harness serve --port 3456
```
Open `http://127.0.0.1:3456/dashboard` in your browser.

### 2. Live Run with Automatic Dashboard
Run a scenario while streaming events directly to the embedded web dashboard:
```bash
agent-harness run \
  --scenario ./scenario.yaml \
  --command "node agent.js" \
  --telemetry \
  --telemetry-port 3456 \
  --keep-alive
```

### Key Capabilities
- **Embedded Web UI**: Dark mode dashboard displaying execution turns, token counters, tool invocations, duration, and expandable JSON event payloads.
- **Server-Sent Events (SSE)**: Connect to `/api/events` with automatic heartbeat pings (`: keepalive`) to prevent proxy timeouts.
- **Reconnection Recovery**: Automatic miss-event replay using `Last-Event-ID` header or `?lastEventId=` query parameter backed by an in-memory `EventRingBuffer`.
- **Event Filtering**: Subscribe to granular event topics such as `?types=tool:*,turn:*` or filter directly in the UI.
- **REST Endpoints**:
  - `GET /api/status`: Active scenario, connected client count, uptime, and memory buffer usage.
  - `GET /api/history`: Chronological event log with `limit`, `type`, and `scenarioId` filters.
  - `GET /api/report`: Latest verification report and assertion pass/fail breakdown.
  - `GET /api/trajectory`: Full step-by-step agent trajectory.
  - `POST /api/events`: Ingest events from distributed test runners or remote agents.

### Programmatic SDK Usage
```typescript
import { TelemetryServer, TelemetryObserver, AgentHarness } from 'agent-harness';

// Start server
const telemetryServer = new TelemetryServer({ port: 3456, host: '127.0.0.1' });
const { url } = await telemetryServer.start();
console.log(`Telemetry dashboard ready at: ${url}/dashboard`);

// Attach observer to agent scenario execution
const observer = new TelemetryObserver({ server: telemetryServer });

const { report } = await AgentHarness.runScenario(
  scenario,
  async (ctx) => {
    // Agent execution steps automatically stream to dashboard
  },
  { observers: [observer] }
);

telemetryServer.setLatestReport(report);
```

## Interactive Steering & Breakpoint Debugger (Human-in-the-Loop)

Agent evaluations often encounter loops, hallucinated commands, or safety risks. The **Interactive Steering & Breakpoint Engine** introduces full debugging and intervention capabilities without breaking deterministic harnesses.

### 1. Conditional Breakpoint Rules
Breakpoints can be added statically or dynamically at runtime:
- **`tool`**: Matches tool name by exact string or RegExp (e.g. `^exec_.*`, `bash`), with optional argument matching.
- **`error_count`**: Suspends when consecutive tool errors reach a threshold (e.g. `error: 3`).
- **`turn`**: Suspends when execution exceeds a turn count (e.g. `turn: 5`).
- **`budget_ratio`**: Triggers when token or turn consumption passes a watermark (e.g. `0.85`).
- **`custom`**: Evaluates custom async predicate functions against execution context.

### 2. Runtime Intervention Actions
When execution hits a breakpoint or is manually paused:
- `continue`: Resumes normal execution.
- `inject_prompt`: Injects corrective feedback/guidance into the agent prompt queue.
- `override_tool`: Intercepts tool invocation and replaces its output with a custom mock result without invoking sandbox binaries.
- `skip_tool`: Skips tool execution with an optional fallback response.
- `abort`: Terminates execution immediately and marks trajectory status as `aborted`.

### 3. RESTful Control Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/control/state` | Retrieve current pause status, active breakpoint hit, and history |
| `POST` | `/api/control/pause` | Pause running execution manually |
| `POST` | `/api/control/resume` | Resume execution with optional single-step action |
| `POST` | `/api/control/intervene` | Submit intervention action (`inject_prompt`, `override_tool`, `skip_tool`, `abort`) |
| `POST` | `/api/control/breakpoint` | Dynamically register a new breakpoint rule |
| `DELETE` | `/api/control/breakpoint?id=<id>` | Remove an existing breakpoint rule |

### 4. CLI & SDK Usage

Run with interactive steering and breakpoints:
```bash
# Start scenario with live dashboard and tool breakpoint
agent-harness run -s ./scenario.yaml --telemetry -i --breakpoint tool:bash --breakpoint error:3
```

Programmatic TypeScript SDK:
```typescript
import { AgentHarness, SteeringController, TelemetryServer } from 'agent-harness';

const steering = new SteeringController();

// Add breakpoint for destructive operations
steering.addBreakpoint({
  id: 'bp_bash_guard',
  type: 'tool',
  toolPattern: 'bash',
});

const server = new TelemetryServer({ port: 3456, steering });
await server.start();

const { report, trajectory } = await AgentHarness.runScenario(
  scenario,
  async (ctx) => {
    // Injected prompts can be consumed in the agent loop
    const guidePrompts = ctx.steering?.consumeInjectedPrompts();
    if (guidePrompts && guidePrompts.length > 0) {
      console.log('Received human guidance:', guidePrompts);
    }

    // Agent executes tools; breakpoint triggers automatically
    await ctx.tools.call('bash', { command: 'echo hello' });
  },
  { steering }
);
```

## Architecture Specification

For an in-depth dive into the internal design, sandbox boundaries, trajectory model, and event bus lifecycle, see [docs/architecture.md](docs/architecture.md).

---

## License

MIT (c) 2026 hirohana77
