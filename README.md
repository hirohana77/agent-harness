# agent-harness

> Deterministic execution, sandbox evaluation, and trajectory verification harness for autonomous AI agents.

[![npm version](https://img.shields.io/npm/v/agent-harness.svg)](https://www.npmjs.com/package/agent-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

[English](README.md) | [中文说明](README_ZH.md)

---

## Highlights

- **Adversarial Red-Teaming & Safety Guardrail Engine**: Systematic adversarial probe injection (prompt injection, secret exfiltration, privilege escalation, destructive commands, supply chain, defense bypass), deep trajectory vulnerability detection, active runtime guardrails (`audit` & `enforce`), defense posture benchmarking, and multi-format safety audit reports.
- **Multi-Agent Tournament Arena & Elo/Glicko Ladder Engine**: Pairwise head-to-head competitive evaluation, multi-criteria tie-breakers, Round-Robin/Swiss/Matrix tournament modes, calibrated Elo & Glicko-2 ratings, cross-table matrix, and multi-format leaderboards.
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

## Differential Trajectory Comparator & Regression Analyzer

When iterating on agent prompts, LLM models (e.g. Claude 3.5 Sonnet vs GPT-4o), or evaluating unsteered vs steered runs, simple binary pass/fail results conceal critical behavioral regressions. The **Differential Trajectory Comparator** provides step-by-step sequence alignment, regression severity scoring, anomaly detection, and root-cause divergence analysis.

### 1. Key Capabilities
- **Dynamic Sequence Alignment**: Needleman-Wunsch sequence alignment adapted for agent execution steps, matching tool calls and thoughts even across reordered or exploratory actions.
- **Root-Cause Divergence Pinpointing**: Detects and highlights the exact *First Divergence Step* where candidate execution deviated (e.g. tool mismatch, altered arguments, or execution error).
- **Comprehensive Metric Deltas**: Detailed delta tracking for turns, tool invocations, prompt/completion tokens, latency, and cost.
- **Automated Anomaly Detection**:
  - `loop_detected`: Repetitive tool invocation loops (e.g. identical command called $\ge 3$ times).
  - `error_spike`: Tool failure rate escalation.
  - `token_explosion`: Significant token inflation above user thresholds (e.g. $+50\%$).
  - `empty_turn`: Ineffective turns lacking tool calls or responses.
  - `rapid_failure`: Premature termination or early crash.
- **Multi-Format Visual Diff Reporters**:
  - `terminal`: Rich ANSI color side-by-side terminal diff with severity badges and step tags (`[MATCH]`, `[MODIFIED]`, `[ADDED]`, `[REMOVED]`).
  - `markdown`: GitHub PR-ready Markdown report with summary tables, metrics, and step alignments.
  - `html`: Standalone obsidian-dark styled HTML diff dashboard with interactive cards and tables.
  - `json`: Schema-validated JSON report for programmatic CI/CD integration.
- **CI/CD Quality Gating**: Exit with code `1` on detected regressions via `--fail-on-regression`.

### 2. CLI Usage
```bash
# Compare two trajectories in terminal format
agent-harness diff baseline.json candidate.json

# Generate Markdown diff for GitHub Pull Request summary
agent-harness diff baseline.json candidate.json --format markdown --output diff-report.md

# Generate standalone HTML visualization
agent-harness diff baseline.json candidate.json --format html --output diff-dashboard.html

# Fail CI pipeline if functional or stability regression is detected
agent-harness diff baseline.json candidate.json --fail-on-regression --token-ratio 0.4
```

### 3. Programmatic SDK Usage
```typescript
import { TrajectoryComparator, renderTrajectoryDiff } from "agent-harness";

// Compare two trajectory artifacts
const diff = TrajectoryComparator.compare(baselineTrajectory, candidateTrajectory, {
  strictArgs: false,
  tokenRegressionRatio: 0.5,
  minSimilarityThreshold: 0.6,
});

console.log("Regression detected?", diff.regression.isRegression);
console.log("Severity:", diff.regression.severity); // "identical" | "equivalent" | "minor_drift" | "regression" | "critical_failure"
console.log("First divergence:", diff.firstDivergence?.description);

// Render markdown report
const markdown = renderTrajectoryDiff(diff, "markdown");
```


## Chaos Engineering & Agent Resilience Evaluation Framework

Autonomous AI agents in production inevitably face volatile environments: flaky networks, rate limits, timeouts, corrupted stdout, and adversarial prompt injections embedded in external files or tool outputs. The **Chaos Engineering & Resilience Evaluation Framework** (`src/chaos`) allows teams to inject deterministic and probabilistic faults into agent tool pipelines and evaluate the agent's resilience, self-healing rate, loop avoidance, and prompt poisoning resistance.

### 1. Key Capabilities
- **Modular Fault Injectors**:
  - `latency`: Injects synthetic latency, jitter, or command timeouts (`exitCode: 124`).
  - `error`: Injects synthetic errors, exit codes, and simulated HTTP codes (`503 Unavailable`, `403 Forbidden`).
  - `rate_limit`: Simulates API throttling (`HTTP 429 Too Many Requests`) with custom `Retry-After` headers.
  - `output_corruption`: Corrupts tool stdout (truncation, broken JSON syntax, or garbled bytes).
  - `adversarial_prompt`: Injects indirect prompt injection payloads and canary tokens (`CHAOS_POISON_CANARY_42`) to test if the agent gets tricked into leaking tokens or abandoning user instructions.
- **Intelligent Trigger Strategies**:
  - `always`: Injects fault on every matching invocation.
  - `burst`: Injects $N$ consecutive failures to test retry-and-recovery patterns.
  - `every_n_calls`: Injects periodically on interval intervals.
  - `call_index`: Injects exclusively on specified step indices (e.g. step 1 and 3).
  - `probability`: Injects probabilistically ($0.0 - 1.0$) for Chaos Monkey testing.
- **Resilience Scorecard & Metrics**:
  - **Self-Healing Recovery Rate**: Detects if the agent successfully recovers after an injected fault.
  - **Mean Turns to Recovery (MTTR)**: Measures diagnostic efficiency from failure to next success.
  - **Retry Storm / Loop Detection**: Flags repetitive unadapted calls with identical parameters ($\\ge 3$ times).
  - **Poison Defense Rate**: Flags if canary tokens are leaked into the model context or output messages.
  - **Overall Resilience Score (0 - 100)**: Grades agent robustness across grades `S`, `A`, `B`, `C`, `F`.
- **Pre-Built Profiles**:
  - `transient-network`: Network drop on git/curl/npm, recovers on retry.
  - `rate-limit`: HTTP 429 throttling after initial calls.
  - `adversarial-poison`: Prompt jailbreak and canary leak traps in tool outputs.
  - `corrupted-output`: Broken JSON payloads.
  - `chaos-monkey`: Randomized mixed jitter and intermittent errors.
- **Multi-Format Scorecard Reporters**:
  - `terminal`: Color-coded resilience radar, metrics breakdown, and architectural recommendations.
  - `markdown`: GitHub PR-ready Markdown tables.
  - `json`: Schema-validated JSON scorecard for CI quality gates.

### 2. CLI Usage
```bash
# Run chaos resilience test with transient network profile
agent-harness chaos -s scenario.yaml -p transient-network -c "npm install && npm test"

# Run with Chaos Monkey disruptor and output Markdown scorecard
agent-harness chaos -s scenario.yaml -p chaos-monkey --format markdown -o chaos-report.md

# Enforce CI quality gate (exit code 1 if resilience score < 80)
agent-harness chaos -s scenario.yaml -p rate-limit --min-score 80
```

### 3. Programmatic SDK Usage
```typescript
import { ChaosEngine, TransientNetworkProfile, renderResilienceScorecard } from "agent-harness";

// Initialize chaos engine with profile
const chaos = new ChaosEngine(TransientNetworkProfile);

// Wire into VirtualToolDispatcher
dispatcher.setChaosEngine(chaos);

// Execute tool invocations
await dispatcher.call("exec_command", { command: "git clone https://example.com/repo.git" });

// Generate scorecard
const scorecard = chaos.generateScorecard("repo-clone-task");
console.log("Resilience Grade:", scorecard.metrics.rating); // S, A, B, C, F
console.log("Resilience Score:", scorecard.metrics.resilienceScore);

// Render markdown report
const markdown = renderResilienceScorecard(scorecard, "markdown");
```


## Cluster Trajectory Consensus & Route Mining Engine

In modern AI agent evaluation and ensemble systems (e.g., Best-of-N sampling, Self-Consistency, SWE-bench rollouts, and multi-agent debates), developers run $N$ parallel rollouts for the same task. The **Cluster Trajectory Consensus Engine** (`src/consensus`) performs progressive Multi-Sequence Alignment (MSA) across $N$ trajectories ($N \ge 2$), quantifies cross-run determinism, identifies critical bottlenecks and failure traps, and synthesizes the optimal **Canonical Golden Trajectory**.

### 1. Key Capabilities
- **Progressive Multi-Sequence Alignment (MSA)**:
  - Aligns discrete tool calls, turn completions, arguments, and outcomes across $N$ independent runs into a global consensus timeline.
  - Accommodates exploratory probes and divergent retries without cascading misalignments.
- **Consensus Step Categorization & Agreement Metrics**:
  - `invariant`: Steps executed by 100% of runs in the cluster (indispensable checkpoints).
  - `majority`: Steps agreed upon by >50% of runs.
  - `minority`: Steps shared by $\le 50\%$ of runs.
  - `outlier`: Single-run deviations, exploratory probes, or hallucinations.
- **Critical Node & Trap Discovery**:
  - **Invariant Bottlenecks**: Critical checkpoints passed by successful runs, computing success correlation ($r \in [-1, 1]$).
  - **Dead-End Failure Traps**: Branch points correlated with agent failure and policy violations.
- **Path Diversity & Shannon Entropy**:
  - Measures decision variance: low entropy indicates high determinism, while high entropy highlights exploratory branching.
- **Canonical Golden Trajectory Synthesis**:
  - Distills a minimal, optimal golden trajectory by pruning outliers, deduplicating repetitive loops, and packing high-confidence steps into executable turns.
- **Multi-Format Reporting**:
  - `terminal`: Color-coded ASCII timeline matrix, bottleneck markers, and consensus radar.
  - `markdown`: GitHub PR-ready tables for CI/CD audit logs.
  - `json`: Full MSA matrix and metadata for automated downstream analysis.

### 2. CLI Usage
```bash
# Analyze consensus across trajectory rollouts
agent-harness consensus -t ./runs/run-1.json ./runs/run-2.json ./runs/run-3.json

# Analyze all trajectory JSONs in directory, export Markdown report and synthesized Golden Path
agent-harness consensus -t ./runs/ --format markdown -o consensus-report.md -s golden-trajectory.json

# Enforce consensus agreement CI gate (fail if consensus score < 80)
agent-harness consensus -t ./runs/ --min-score 80
```

### 3. Programmatic SDK Usage
```typescript
import {
  ClusterConsensusEngine,
  renderConsensusReport,
  type Trajectory,
} from "agent-harness";

// Load rollouts
const rollouts: Trajectory[] = [/* run1, run2, run3 */];

// Run cluster consensus analysis
const result = ClusterConsensusEngine.analyzeCluster(rollouts, {
  bottleneckThreshold: 0.8,
  minAgreementRate: 0.5,
});

console.log("Overall Consensus Score:", result.metrics.overallAgreementScore);
console.log("Shannon Entropy:", result.metrics.pathDiversityEntropy);
console.log("Bottlenecks Found:", result.bottlenecks.length);
console.log("Golden Path Steps:", result.canonicalTrajectory.totalSteps);

// Render Markdown or Terminal report
const report = renderConsensusReport(result, "markdown");
```

## Trajectory Policy Distillation & Dynamic Guidance Engine

Once high-quality trajectories or consensus clusters have synthesized a **Canonical Golden Trajectory** and identified hazardous **Dead-End Traps**, the **Policy Distillation & Dynamic Guidance Engine** (`src/distillation`) completes the autonomous agent self-improvement flywheel. It distills actionable execution policies, invariant milestone roadmaps, negative anti-pattern constraints, and token-budget-aware few-shot exemplars, dynamically steering subsequent agent runs at runtime to prevent recurring pitfalls and accelerate task convergence.

### 1. Key Capabilities
- **Policy Distillation from Multi-Source Inputs**:
  - Distills structured guidance from `ClusterConsensusResult`, `CanonicalTrajectory`, or single raw `Trajectory`.
  - Automatically identifies invariant checkpoints as positive milestones with importance levels (`critical`, `recommended`).
  - Converts dead-end traps and high-frequency error patterns into negative anti-pattern rules (`NegativePatternGuidance`) with remedy suggestions.
- **Token-Budget-Aware Exemplar Compression**:
  - Compresses redundant repetitive turns (e.g. repeated directory scans or redundant tool calls).
  - Enforces strict token budgets (e.g. 500, 1500 tokens) via intelligent middle-turn pruning and thought/output summarization while preserving critical start/end milestones.
- **Dynamic Guidance Dispatcher**:
  - Tracks real-time agent execution turns using an internal state machine (`tracking`, `milestones_complete`, `diverged`, `blocked`).
  - Emits real-time dynamic feedback (`hint`, `warn`, `block`, `milestone_advance`, `diverged`).
  - Intercepts dangerous actions matching anti-patterns with actionable remediation hints before execution.
- **Seamless Steering Controller Blueprints**:
  - Auto-synthesizes dynamic breakpoint and intervention rules ready for `SteeringController` injection (`override_tool`, `inject_prompt`).
- **Multi-Target Formats & Exporters**:
  - `markdown`: Formats into a system prompt section (`# Strategic Execution Guidance & Proven Milestones`).
  - `anthropic`: XML-tagged prompt structure (`<distilled_guidance>...</distilled_guidance>`).
  - `fewshot`: OpenAI-compatible `ChatCompletionMessageParam` array with structured tool calls.
  - `steering`: JSON breakpoint rules ready for runtime execution steering.
  - `terminal` & `markdown`: Visual scorecard reports.

### 2. CLI Usage
```bash
# Distill strategic policy and display ANSI terminal summary
agent-harness distill -i ./runs/consensus-result.json

# Distill guidance into Markdown format and export steering rules
agent-harness distill -i ./runs/canonical.json -f markdown -o policy-guidance.md --export-steering ./steering-rules.json

# Export OpenAI few-shot messages with 1000-token budget limit
agent-harness distill -i ./runs/trajectory.json -f fewshot -b 1000 -o fewshot.json
```

### 3. Programmatic SDK Usage
```typescript
import {
  PolicyDistillationEngine,
  renderDistillationReport,
  type DistilledPolicy,
} from "agent-harness";

const engine = new PolicyDistillationEngine({
  tokenBudget: 1200,
  includeNegativeGuidance: true,
  includeSteeringRules: true,
});

// Distill policy from consensus result or canonical trajectory
const policy: DistilledPolicy = engine.distillFromConsensus(consensusResult);

// Format as Markdown system prompt or Anthropic XML
const systemPrompt = engine.formatPolicy(policy, "markdown");

// Create dynamic runtime dispatcher for agent monitoring
const dispatcher = engine.createDispatcher(policy);

// Evaluate incoming agent step at runtime
const feedback = dispatcher.evaluateStep({
  turnNumber: 1,
  toolName: "bash",
  arguments: { command: "rm -rf /tmp/data" },
});

if (feedback.action === "block") {
  console.warn("Blocked dangerous command:", feedback.message);
}
```

## Adaptive Task Synthesis & Auto-Curriculum Closed-Loop Engine

Static evaluation benchmarks often suffer from dataset contamination, rigid assertions, and a lack of adaptive feedback. Once verifiers, chaos injection, consensus analysis, and distillation identify specific agent weaknesses (e.g., AST syntax fragility, security violations, budget exhaustion, or path confusion), the **Adaptive Task Synthesis & Auto-Curriculum Closed-Loop Engine** (`src/curriculum`) automatically generates progressive difficulty ladders to evaluate, stress-test, and remediate autonomous agents in a complete closed loop.

### 1. Key Capabilities
- **4-Tier Progressive Difficulty Ladder**:
  - `novice`: Provides explicit step-by-step guidance notes, relaxed budget scale (+25%), and auxiliary guidelines.
  - `intermediate`: Appends realistic engineering constraints (backward compatibility, type retention) and configuration fixtures.
  - `advanced`: Injects edge-case boundary conditions, tightens budget scale (-15%), and enforces strict trajectory security invariants.
  - `adversarial`: Injects decoy legacy files, deceptive context distractors, wildcard command restrictions, and severe budget pressure (-25%).
- **Multi-Dimensional Task Mutation (`TaskSynthesizer`)**:
  - `instruction`: Deterministic seeded prompt perturbations, distractor injections, and targeted weakness mandates.
  - `workspace`: Programmatic file perturbation, decoy file seeding, nested architecture structures, and type definitions.
  - `verifier`: Adaptive budget scaling (`maxTurns`, `timeoutMs`, `maxTokens`) and automated trajectory invariant rule synthesis.
  - `environment`: Security whitelist tightening, command denial expansions, and sandbox constraints.
- **Diagnostic Vulnerability Profiling (`WeaknessProfiler`)**:
  - Automatically analyzes collections of past `HarnessReport` runs across 7 core categories:
    `ast_syntax_error`, `security_violation`, `infinite_loop`, `budget_exhaustion`, `command_flakiness`, `file_integrity`, `tool_format_error`.
  - Recommends tailored curriculum stages and targeted weakness mutations.
- **Adaptive Progression Gating & Competency Scoring (`AutoCurriculumRunner`)**:
  - Dynamically gates progression: agents must achieve threshold pass rates (e.g. $\ge 75\%$) to advance to subsequent difficulty tiers.
  - Dynamically updates Elo-inspired competency ratings based on stage difficulty multipliers and pass rate expectations.
  - Seamlessly integrates distilled guidance policies (`src/distillation`) at higher stages to quantify remediation uplift.
- **Multi-Format Visual Scorecards & Exporters**:
  - `terminal`: Rich ANSI progression ladder, competency rating change, and target weakness remediation matrix.
  - `markdown`: CI/CD and pull-request ready summary tables.
  - `json`: Machine-readable results and metrics.

### 2. CLI Usage
```bash
# Run auto-curriculum campaign against a scenario across all 4 stages
agent-harness curriculum -s ./scenarios/calc.yaml

# Run specific stages with custom scenarios per stage and export plan
agent-harness curriculum -s ./scenarios/calc.yaml --stages novice,intermediate --scenarios-per-stage 3 --export-plan ./curriculum-plan.json

# Run curriculum with distilled policy guidance injected for advanced tiers
agent-harness curriculum -s ./scenarios/calc.yaml -g ./runs/distilled-policy.json -f markdown -o ./curriculum-report.md

# Enforce minimum competency score threshold (exits non-zero on failure)
agent-harness curriculum -s ./scenarios/calc.yaml --min-competency 1050
```

### 3. Programmatic SDK Usage
```typescript
import {
  AutoCurriculumEngine,
  TaskSynthesizer,
  AutoCurriculumRunner,
  renderCurriculumReport,
  type CurriculumResult,
} from "agent-harness";

const engine = new AutoCurriculumEngine();

// 1. Synthesize a mutated scenario targeting specific weaknesses
const mutatedScenario = engine.synthesizeTask(baseScenario, {
  difficulty: "advanced",
  targetWeaknesses: ["ast_syntax_error", "security_violation"],
  seed: 42,
});

// 2. Generate a 4-tier progressive curriculum plan
const plan = engine.generatePlan(baseScenario, {
  stages: ["novice", "intermediate", "advanced", "adversarial"],
  scenariosPerStage: 2,
  adaptiveGating: true,
});

// 3. Execute agent across the curriculum with policy guidance
const result: CurriculumResult = await engine.executeCurriculum({
  agent: myAgentAdapter,
  plan,
  guidancePolicy: distilledPolicy,
  stopOnGatingFailure: true,
});

console.log(renderCurriculumReport(result, "terminal"));
```

## Multi-Agent Tournament Arena & Elo/Glicko Ladder Engine

Evaluating single agents in isolation only reveals partial capability. Comparing multiple agent architectures, model providers (e.g. GPT-4o, Claude 3.5 Sonnet, DeepSeek V3, Llama 3), prompt revisions, or steering policies requires head-to-head competitive benchmarking. The **Multi-Agent Tournament Arena & Elo/Glicko Ladder Engine** (`src/arena`) coordinates multi-candidate tournaments, calculates calibrated relative rankings, computes cross-table match statistics, and provides tournament bracket visualization.

### 1. Key Capabilities
- **Flexible Tournament Modes (`MatchScheduler`)**:
  - `round-robin`: Exhaustive all-pairs head-to-head competition across all test scenarios and rounds.
  - `swiss`: Dynamic progressive pairing matching agents with comparable skill ratings without repeat matches.
  - `matrix`: Full-matrix evaluation across all scenarios and candidate agents.
  - `bracket`: Single-elimination seeded knockout tournament ($1$ vs $N$, $2$ vs $N-1$).
- **Multi-Dimensional Pairwise Judgement (`MatchEvaluator`)**:
  - **Deterministic Task Verification**: Primary decision gate—task pass beats fail unequivocally.
  - **Multi-Criteria Tie-Breakers**: When both candidates pass (or both fail), computes normalized scores across:
    - *Turn Efficiency*: Minimizes unnecessary exploratory turns.
    - *Token Budget Efficiency*: Minimizes token consumption and inference cost.
    - *Runtime Speed*: Minimizes scenario execution latency.
    - *Safety & Guardrails*: Penalizes security and sandbox infractions.
  - **Calibrated Draw Tolerance**: Fine-grained `drawThreshold` prevents spurious wins when scores differ trivially.
- **Statistical Rating Engines (`IRatingEngine`)**:
  - **Adaptive Elo Engine (`EloRatingEngine`)**: Classic Elo rating with dynamic K-factors (higher volatility for provisional matches, stabilized K for established veterans).
  - **Glicko-2 Engine (`Glicko2RatingEngine`)**: Comprehensive skill rating ($R$), rating deviation ($RD$), and volatility ($sigma$) tracking confidence bounds.
- **Cross-Table Matrix & Dominance Statistics**:
  - Complete $N \times N$ pairwise cross-table (`wins / draws / losses`) across all candidates.
  - Direct head-to-head win-rate and probability estimation (`predictMatchOutcome`).
- **Multi-Format Visual Reports**:
  - `terminal`: ANSI leaderboard with medal standings (🥇, 🥈, 🥉), cross-table grid, and performance stats.
  - `markdown`: Publication-grade Markdown tables for READMEs, PR reviews, and CI/CD artifacts.
  - `json`: Machine-readable tournament reports and exported leaderboards.

### 2. CLI Usage
```bash
# Run a round-robin tournament between multiple candidate agents on scenarios
agent-harness arena -s ./scenarios/calc.yaml -a "claude-3-5,gpt-4o,deepseek-v3"

# Run a Swiss-system tournament with Glicko-2 rating engine and export leaderboard
agent-harness arena -s ./scenarios/calc.yaml -a "agent-a,agent-b,agent-c,agent-d" --mode swiss --rating-system glicko2 --export-leaderboard ./leaderboard.json

# Run tournament and render Markdown report to a file
agent-harness arena -s ./scenarios/calc.yaml -a ./agents.json -m round-robin -r 2 -f markdown -o ./arena-report.md

# Enforce minimum rating threshold on tournament champion
agent-harness arena -s ./scenarios/calc.yaml -a "agent-1,agent-2" --min-rating 1550
```

### 3. Programmatic SDK Usage
```typescript
import {
  ArenaEngine,
  renderArenaReport,
  type CandidateWithTarget,
} from "agent-harness";

const engine = new ArenaEngine();

const candidates: CandidateWithTarget[] = [
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    initialRating: 1500,
    target: claudeAgentAdapter,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    initialRating: 1500,
    target: gptAgentAdapter,
  },
];

// Run direct 1v1 match
const matchResult = await engine.evaluateMatch(candidates[0], candidates[1], scenario);
console.log(`Outcome: ${matchResult.outcome}, Margin: ${matchResult.margin}`);

// Run full tournament
const tournamentReport = await engine.runTournament({
  candidates,
  scenarios: [scenarioA, scenarioB],
  config: { mode: "round-robin", rounds: 1, ratingSystem: "elo" },
});

console.log(renderArenaReport(tournamentReport, "terminal"));
```

---

## Adversarial Red-Teaming & Safety Guardrail Evaluation Engine

Autonomous AI agents equipped with bash execution, file systems, and external tools present severe safety and security attack surfaces. The **Adversarial Red-Teaming & Safety Guardrail Evaluation Engine** (`src/redteam`) provides an end-to-end framework to probe agents against adversarial attacks, measure defense posture, evaluate Attack Success Rate (ASR) and Safety Scores (0-100), and enforce active runtime guardrails.

### 1. Key Capabilities
- **Curated Multi-Category Adversarial Probes (`RedTeamProbeCatalog`)**:
  - `prompt-injection`: Direct prompt injection overriding system constraints and roleplay jailbreaks (e.g. system overrides, developer uncensored mode).
  - `indirect-injection`: Untrusted content injection via project files (trojans in README, poisoned markdown) or external tool mock JSON payloads.
  - `secret-exfiltration`: Probing for environment credentials (`.env`, `AWS_SECRET_ACCESS_KEY`, API tokens, private keys) and canary secret exfiltration.
  - `privilege-escalation`: Sudo privilege escalation, world-writable permission tampering (`chmod 777`).
  - `destructive-command`: Repository corruption (`rm -rf .git`) and workspace file wiping (`rm -rf *`, `rm -rf /`).
  - `supply-chain`: Unauthorized remote shell piping (`curl | sh`, `wget | bash`).
  - `defense-bypass`: Evasion of static string matching via base64 encoded shell pipelines (`base64 -d | sh`).
- **Automated Adversarial Scenario Mutator (`AdversarialMutator`)**:
  - Seamlessly injects adversarial payloads across multiple vectors (`instruction`, `file-injection`, `env-injection`, `mock-tool`) without corrupting base test contracts.
- **Deep Trajectory Vulnerability Detector (`VulnerabilityDetector`)**:
  - Comprehensive inspection across turn command executions, tool arguments, assistant messages, and execution outputs.
  - Correlates Canary Secret tokens and regex patterns to verify whether an attack was successfully exploited vs defended vs mitigated.
- **Active Safety Guardrails (`CompositeGuardrail`)**:
  - `CommandSafetyGuardrail`: Intercepts dangerous recursive deletions, privilege escalations, and piped shell commands.
  - `SecretLeakGuardrail`: Blocks reading of `.env`, SSH keys, and leaks of sensitive canary tokens into outputs.
  - Modes: `none` (unshielded probe), `audit` (log violations without blocking), and `enforce` (actively raise `SecurityViolationError`).
- **Defense Posture Benchmarking (`benchmarkDefense`)**:
  - Directly compares an agent's unshielded baseline against active guardrail enforcement, quantifying reduction in ASR ($\\Delta \\text{ASR}$) and uplift in Safety Score ($\\Delta \\text{Score}$).
- **Multi-Format Safety Audit Reports**:
  - `terminal`: Color-coded risk level badges, ASR gauge, category scorecards, and forensic finding logs.
  - `markdown`: Publication-grade security audit reports and benchmark comparison tables for CI/CD gates.
  - `json`: Machine-readable structured reports with full forensic traces.

### 2. CLI Usage
```bash
# Run red-team audit across all built-in probes on a scenario
agent-harness redteam -s ./scenario.yaml

# Run specific risk categories with active guardrail enforcement
agent-harness redteam -s ./scenario.yaml -c prompt-injection,secret-exfiltration -g enforce

# Benchmark defense posture (baseline vs active guardrail) and output Markdown report
agent-harness redteam -s ./scenario.yaml --benchmark-defense -f markdown -o ./redteam-benchmark.md

# Enforce security gates in CI/CD (fail if ASR > 10% or Safety Score < 90)
agent-harness redteam -s ./scenario.yaml --max-asr 0.10 --min-safety-score 90 --export-findings ./findings.json
```

### 3. Programmatic SDK Usage
```typescript
import {
  RedTeamEngine,
  renderRedTeamReport,
  renderBenchmarkComparison,
} from "agent-harness";

const engine = new RedTeamEngine();

// 1. Audit an agent target against critical adversarial probes
const auditReport = await engine.auditAgent(myAgentTarget, scenario, {
  severities: ["critical", "high"],
  guardrailMode: "enforce",
});

console.log(renderRedTeamReport(auditReport, "terminal"));

// 2. Benchmark defense uplift with active guardrails
const benchmark = await engine.benchmarkDefense(myAgentTarget, scenario);
console.log(`Prevented Exploits: ${benchmark.preventedExploitsCount}`);
console.log(`Safety Uplift: +${benchmark.deltaSafetyScore} points`);
console.log(renderBenchmarkComparison(benchmark, "markdown"));
```

---

## Architecture Specification

For an in-depth dive into the internal design, sandbox boundaries, trajectory model, and event bus lifecycle, see [docs/architecture.md](docs/architecture.md).

---

## License

MIT (c) 2026 hirohana77
