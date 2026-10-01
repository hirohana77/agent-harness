# Agent Harness Architecture Specification

`agent-harness` is designed for high-fidelity, deterministic evaluation and sandboxed execution of autonomous AI coding agents (such as Codex, Claude Computer Use, ReAct agents, and SWE-style tools).

---

## 1. System Architecture

The harness is structured into 6 decoupled layers:

```text
┌────────────────────────────────────────────────────────┐
│                   CLI & Public SDK                     │
│        (CLI Runner, Programmatic AgentHarness)         │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│              Core Orchestration Engine                 │
│   (Scenario Parsing, Lifecycle, Execution Context)    │
└────────────┬─────────────┬─────────────┬───────────────┘
             │             │             │
┌────────────▼──┐   ┌──────▼──────┐   ┌──▼───────────────┐
│Sandbox Manager│   │  Trajectory │   │Streaming Event   │
│  & Security   │   │  Recorder   │   │     Bus          │
└────────────┬──┘   └──────┬──────┘   └──┬───────────────┘
             │             │             │
┌────────────▼──┐   ┌──────▼──────┐   ┌──▼───────────────┐
│ Command & Git │   │ Offline     │   │Live Observers    │
│  Environment  │   │  Replayer   │   │(Console/NDJSON)  │
└───────────────┘   └──────┬──────┘   └──────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│          Verifier & Multi-Channel Reporters            │
│       (Files, Shell Exit Codes, Markdown, JSON)        │
└────────────────────────────────────────────────────────┘
```

1. **CLI & SDK Entry Layer** (`src/cli/`, `src/index.ts`):
   - Standalone CLI for running, validating, and replaying scenarios.
   - Programmatic TypeScript SDK (`AgentHarness.runScenario`).

2. **Core Orchestration Layer** (`src/core/`):
   - `AgentHarness`: Coordinates workspace creation, execution context, trajectory lifecycle, and verification.
   - Domain schemas (`src/core/schemas.ts`) with runtime Zod validation.
   - Typed error hierarchies (`src/core/errors.ts`).

3. **Isolated Sandbox Layer** (`src/sandbox/`):
   - `SandboxBackend` interface & `SandboxBackendFactory`: Pluggable runtime strategy supporting `LocalSandboxBackend` and `ContainerSandboxBackend` (Docker and Podman).
   - `ContainerSandboxBackend`: Manages isolated container spin-up, workspace volume mounting (`-v`), cgroups resource constraints (`--memory`, `--cpus`, `--pids-limit`), and isolated networking (`--network none`).
   - `ContainerProcessRegistry`: Global process-level registry guaranteeing clean container teardown on exit, SIGINT, or crash.
   - `WorkspaceManager`: Ephemeral temporary directory provisioning, seed files injection, and Git baseline tracking.
   - `SecurityPolicyChecker`: Validates command blacklists and enforces strict path confinement.
   - `CommandExecutor`: Dispatches commands through the active backend with timeout management and output capping.

4. **Trajectory Engine** (`src/trajectory/`):
   - `TrajectoryRecorder`: Tracks turns, tool calls, token budgets, and execution latency in real-time.
   - `TrajectoryReplayer`: Re-executes recorded trajectories against a fresh sandbox without LLM API costs.
   - `TrajectoryExporter`: Exports/imports trajectories to JSON and YAML.

5. **Streaming Telemetry & Event Bus** (`src/events/`):
   - `TrajectoryEventBus`: Fast indexed pub/sub dispatcher supporting wildcard patterns (`tool:*`, `*`), synchronous and asynchronous dispatching, and error boundaries.
   - `LiveConsoleObserver`: Formats real-time colored progress events directly in the developer terminal.
   - `JsonLinesStreamObserver`: Persists real-time events to NDJSON streams or files with buffered backpressure.
   - `BufferedStreamObserver`: Sliding window memory buffer for event replay, filtering, and post-mortem analysis.

6. **Verification & Reporting Layer** (`src/verifier/`, `src/reporters/`):
   - `FileVerifier`, `CommandVerifier`, `TrajectoryVerifier`.
   - `TerminalReporter`, `MarkdownReporter`, `JsonReporter`.

---

## 2. Event Bus Lifecycle & Contract

Every scenario execution emits typed events across its lifecycle:

1. `scenario:start`: Triggered when workspace setup completes and agent execution begins.
2. `sandbox:ready`: Triggered when container or local sandbox backend is provisioned and ready.
3. `turn:start`: Agent starts a reasoning turn with user prompt and initial thoughts.
4. `tool:start`: A native or mock tool execution commences with arguments.
5. `tool:end`: Tool completes execution with exit code, stdout/stderr, and duration.
6. `budget:warning`: Emitted when turn count or token consumption reaches 80% of defined budget.
7. `turn:complete`: Turn wraps up with assistant message and token deltas.
8. `status:change`: State transitions (`running` -> `completed` / `error` / `budget_exceeded` / `security_violation`).
9. `scenario:complete`: Verification finished, final pass/fail report emitted.
10. `sandbox:teardown`: Triggered when container is safely destroyed and resources released.

