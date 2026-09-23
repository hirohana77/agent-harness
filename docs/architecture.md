# Agent Harness Architecture Specification

`agent-harness` is designed for high-fidelity, deterministic evaluation and sandboxed execution of autonomous AI coding agents (such as Codex, Claude Computer Use, ReAct agents, and SWE-style tools).

---

## 1. System Architecture

The harness is structured into 5 decoupled layers:

1. **CLI & SDK Entry Layer** (`src/cli/`, `src/index.ts`):
   - Standalone CLI for running, validating, and replaying scenarios.
   - Programmatic TypeScript SDK (`AgentHarness.runScenario`).

2. **Core Orchestration Layer** (`src/core/`):
   - `AgentHarness`: Coordinates workspace creation, execution context, trajectory lifecycle, and verification.
   - Domain schemas (`src/core/schemas.ts`) with runtime Zod validation.
   - Typed error hierarchies (`src/core/errors.ts`).

3. **Isolated Sandbox Layer** (`src/sandbox/`):
   - `WorkspaceManager`: Ephemeral temporary directory provisioning, seed files injection, and Git baseline tracking.
   - `SecurityPolicyChecker`: Validates command blacklists and enforces strict path confinement.
   - `CommandExecutor`: Spawns subprocesses with timeout management and output capping.

4. **Trajectory Engine** (`src/trajectory/`):
   - `TrajectoryRecorder`: Tracks turns, tool calls, token budgets, and execution latency in real-time.
   - `TrajectoryReplayer`: Re-executes recorded trajectories against a fresh sandbox without LLM API costs.
   - `TrajectoryExporter`: Exports/imports trajectories to JSON and YAML.

5. **Verification & Reporting Layer** (`src/verifier/`, `src/reporters/`):
   - `FileVerifier`, `CommandVerifier`, `TrajectoryVerifier`.
   - `TerminalReporter`, `MarkdownReporter`, `JsonReporter`.
