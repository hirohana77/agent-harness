import { Trajectory, ToolCall, ScenarioDefinition, HarnessReport, AssertionItemResult } from "../core/types.js";
import { CausalGraph, CausalNode, CausalEdge, CausalNodeType, CausalEdgeType } from "./types.js";

export interface GraphBuilderOptions {
  scenario?: ScenarioDefinition;
  report?: HarnessReport;
  inferImplicitReads?: boolean;
}

export class CausalGraphBuilder {
  private nodes: Record<string, CausalNode> = {};
  private edges: CausalEdge[] = [];
  private artifactVersions: Map<string, number> = new Map();
  private latestArtifactNode: Map<string, string> = new Map();
  private latestEnvNode: Map<string, string> = new Map();
  private edgeCounter = 0;

  constructor() {}

  public build(trajectory: Trajectory, options?: GraphBuilderOptions): CausalGraph {
    const startTime = Date.now();
    this.nodes = {};
    this.edges = [];
    this.artifactVersions.clear();
    this.latestArtifactNode.clear();
    this.latestEnvNode.clear();
    this.edgeCounter = 0;

    // 1. Initial State Node
    const initNodeId = "node_init";
    this.addNode({
      id: initNodeId,
      type: "initial_state",
      label: `Initial Workspace (${trajectory.scenarioId})`,
      status: "neutral",
      metadata: { scenarioId: trajectory.scenarioId },
    });

    // If scenario specifies initialFiles, create initial artifact states
    if (options?.scenario?.workspace?.initialFiles) {
      for (const [filePath, content] of Object.entries(options.scenario.workspace.initialFiles)) {
        const artifactId = this.registerArtifactState(filePath, 0, "created", content);
        this.addEdge(initNodeId, artifactId, "data_write", "init_file");
      }
    }

    let previousTurnNodeId: string | undefined = initNodeId;
    let previousToolCallNodeId: string | undefined = undefined;

    // 2. Process Turns
    for (const turn of trajectory.turns) {
      const turnNodeId = `node_turn_${turn.turnNumber}`;
      this.addNode({
        id: turnNodeId,
        type: "agent_turn",
        label: `Turn ${turn.turnNumber}: ${turn.prompt ? turn.prompt.slice(0, 40) : "Prompt"}`,
        turnNumber: turn.turnNumber,
        status: "neutral",
        metadata: { prompt: turn.prompt },
      });

      // Temporal flow between turns
      if (previousTurnNodeId) {
        this.addEdge(previousTurnNodeId, turnNodeId, "temporal_flow", "next_turn");
      }
      previousTurnNodeId = turnNodeId;

      // If previous tool call had output and this turn has a prompt referencing it, add context_feed
      if (previousToolCallNodeId) {
        this.addEdge(previousToolCallNodeId, turnNodeId, "context_feed", "observation_feed");
      }

      // 3. Process Tool Calls in Turn
      let turnPrevToolNodeId = turnNodeId;
      for (let i = 0; i < turn.toolCalls.length; i++) {
        const call = turn.toolCalls[i];
        const callId = call.callId || `call_${turn.turnNumber}_${i + 1}`;
        const toolNodeId = `node_tool_${callId}`;

        const isFailure =
          call.result?.success === false ||
          (typeof call.result?.exitCode === "number" && call.result.exitCode !== 0) ||
          Boolean(call.result?.error);

        this.addNode({
          id: toolNodeId,
          type: "tool_invocation",
          label: `${call.toolName}${this.formatToolArgsShort(call.arguments)}`,
          turnNumber: turn.turnNumber,
          toolCallId: callId,
          toolName: call.toolName,
          status: isFailure ? "failure" : "success",
          metadata: {
            arguments: call.arguments,
            result: call.result,
          },
        });

        // Edge from turn or previous tool call to this tool call
        this.addEdge(turnPrevToolNodeId, toolNodeId, "temporal_flow", "invokes");
        turnPrevToolNodeId = toolNodeId;
        previousToolCallNodeId = toolNodeId;

        // Analyze file / env side-effects of tool call
        this.analyzeToolDependencies(toolNodeId, call, turn.turnNumber, options?.inferImplicitReads !== false);
      }
    }

    // 4. Assertions & Outcomes
    if (options?.report?.assertionResults) {
      this.linkAssertionResults(options.report.assertionResults);
    } else if (options?.scenario?.assertions) {
      this.linkScenarioAssertions(options.scenario.assertions);
    }

    return {
      scenarioId: trajectory.scenarioId,
      nodes: this.nodes,
      edges: this.edges,
      metadata: {
        totalTurns: trajectory.turns.length,
        totalNodes: Object.keys(this.nodes).length,
        totalEdges: this.edges.length,
        generatedAt: new Date().toISOString(),
        buildDurationMs: Date.now() - startTime,
      },
    };
  }

  private addNode(node: CausalNode): void {
    this.nodes[node.id] = node;
  }

  private addEdge(
    source: string,
    target: string,
    type: CausalEdgeType,
    label?: string,
    weight = 1.0,
    metadata?: Record<string, unknown>
  ): void {
    // Avoid exact duplicate edges
    if (this.edges.some((e) => e.source === source && e.target === target && e.type === type)) {
      return;
    }
    this.edges.push({
      id: `edge_${++this.edgeCounter}`,
      source,
      target,
      type,
      label,
      weight,
      metadata,
    });
  }

  private registerArtifactState(
    path: string,
    turnNum: number,
    action: "created" | "modified" | "deleted",
    contentPreview?: string
  ): string {
    const nextVer = (this.artifactVersions.get(path) || 0) + 1;
    this.artifactVersions.set(path, nextVer);

    const artifactNodeId = `node_artifact_${this.sanitizeId(path)}_v${nextVer}`;
    this.addNode({
      id: artifactNodeId,
      type: "artifact_state",
      label: `${path} (${action} v${nextVer})`,
      turnNumber: turnNum,
      artifactPath: path,
      status: action === "deleted" ? "failure" : "success",
      metadata: {
        path,
        version: nextVer,
        action,
        preview: contentPreview ? contentPreview.slice(0, 100) : undefined,
      },
    });

    this.latestArtifactNode.set(path, artifactNodeId);
    return artifactNodeId;
  }

  private analyzeToolDependencies(
    toolNodeId: string,
    call: ToolCall,
    turnNum: number,
    inferImplicitReads: boolean
  ): void {
    const tool = call.toolName.toLowerCase();
    const args = call.arguments || {};

    if (["write_file", "file_write", "create_file", "save_file"].includes(tool)) {
      const filePath = (args.path || args.file || args.filepath) as string;
      const content = (args.content || args.text || args.body || "") as string;
      if (filePath) {
        const artifactId = this.registerArtifactState(filePath, turnNum, "created", content);
        this.addEdge(toolNodeId, artifactId, "data_write", "writes");
      }
    } else if (["edit_file", "patch_file", "file_edit", "edit"].includes(tool)) {
      const filePath = (args.path || args.file || args.filepath) as string;
      const content = (args.content || args.patch || args.new_string || "") as string;
      if (filePath) {
        const latest = this.latestArtifactNode.get(filePath);
        if (latest) {
          this.addEdge(latest, toolNodeId, "data_read", "reads_before_edit");
        }
        const artifactId = this.registerArtifactState(filePath, turnNum, "modified", content);
        this.addEdge(toolNodeId, artifactId, "data_write", "modifies");
      }
    } else if (["read_file", "file_read", "view_file", "cat"].includes(tool)) {
      const filePath = (args.path || args.file || args.filepath) as string;
      if (filePath) {
        const latest = this.latestArtifactNode.get(filePath);
        if (latest) {
          this.addEdge(latest, toolNodeId, "data_read", "reads");
        }
      }
    } else if (["delete_file", "remove_file", "file_delete", "rm"].includes(tool)) {
      const filePath = (args.path || args.file) as string;
      if (filePath) {
        const artifactId = this.registerArtifactState(filePath, turnNum, "deleted");
        this.addEdge(toolNodeId, artifactId, "data_write", "deletes");
      }
    } else if (["bash", "exec", "sh", "execute_command"].includes(tool)) {
      const cmd = (args.command || args.cmd || "") as string;
      this.parseShellDependencies(toolNodeId, cmd, turnNum, inferImplicitReads);
    }
  }

  private parseShellDependencies(
    toolNodeId: string,
    cmd: string,
    turnNum: number,
    inferImplicitReads: boolean
  ): void {
    // 1. Env exports: export FOO=BAR
    const exportMatches = cmd.matchAll(/(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=([^\s;&|]+)/g);
    for (const match of exportMatches) {
      const varName = match[1];
      const varVal = match[2];
      if (varName && !["PATH", "HOME", "USER"].includes(varName)) {
        const envNodeId = `node_env_${this.sanitizeId(varName)}_${turnNum}`;
        this.addNode({
          id: envNodeId,
          type: "environment_state",
          label: `Env ${varName}=${varVal}`,
          turnNumber: turnNum,
          status: "success",
          metadata: { variable: varName, value: varVal },
        });
        this.addEdge(toolNodeId, envNodeId, "data_write", "exports_env");
        this.latestEnvNode.set(varName, envNodeId);
      }
    }

    // 2. Shell file writes: > file, >> file
    const writeRedirectMatches = cmd.matchAll(/(?:>>|>)\s*([^\s;&|]+)/g);
    for (const match of writeRedirectMatches) {
      const filePath = match[1];
      if (filePath && !["/dev/null", "2>&1"].includes(filePath)) {
        const artifactId = this.registerArtifactState(filePath, turnNum, "modified");
        this.addEdge(toolNodeId, artifactId, "data_write", "redirects_to");
      }
    }

    // 3. Shell touch: touch file
    const touchMatches = cmd.matchAll(/\btouch\s+([^\s;&|]+)/g);
    for (const match of touchMatches) {
      const filePath = match[1];
      if (filePath) {
        const artifactId = this.registerArtifactState(filePath, turnNum, "created");
        this.addEdge(toolNodeId, artifactId, "data_write", "touches");
      }
    }

    // 4. Shell file deletion: rm [-rf] file
    const rmMatches = cmd.matchAll(/\brm\s+(?:-[a-zA-Z]+\s+)?([^\s;&|]+)/g);
    for (const match of rmMatches) {
      const filePath = match[1];
      if (filePath && !filePath.startsWith("-")) {
        const artifactId = this.registerArtifactState(filePath, turnNum, "deleted");
        this.addEdge(toolNodeId, artifactId, "data_write", "removes");
      }
    }

    // 5. Implicit Reads: cat, grep, node, python, etc.
    if (inferImplicitReads) {
      const readMatches = cmd.matchAll(/\b(?:cat|grep|head|tail|node|python|python3|npm test|vitest|pytest)\s+([^\s;&|]+)/g);
      for (const match of readMatches) {
        const candidateFile = match[1];
        if (candidateFile && !candidateFile.startsWith("-")) {
          const latest = this.latestArtifactNode.get(candidateFile);
          if (latest) {
            this.addEdge(latest, toolNodeId, "data_read", "executes_or_reads");
          }
        }
      }
    }
  }

  private linkAssertionResults(assertions: AssertionItemResult[]): void {
    assertions.forEach((assertItem, idx) => {
      const assertNodeId = `node_assert_${idx + 1}`;
      const isPassed = assertItem.passed;

      this.addNode({
        id: assertNodeId,
        type: "assertion_outcome",
        label: `Assert: ${assertItem.message || assertItem.type} [${isPassed ? "PASS" : "FAIL"}]`,
        status: isPassed ? "success" : "failure",
        metadata: {
          assertionType: assertItem.type,
          target: assertItem.target,
          passed: assertItem.passed,
          details: assertItem.details,
        },
      });

      // Target file or command linking
      if (assertItem.target) {
        const latest = this.latestArtifactNode.get(assertItem.target);
        if (latest) {
          this.addEdge(latest, assertNodeId, "assertion_target", "evaluates_file");
        } else {
          // Connect to the latest tool or turn
          const lastTool = Object.values(this.nodes)
            .filter((n) => n.type === "tool_invocation")
            .pop();
          if (lastTool) {
            this.addEdge(lastTool.id, assertNodeId, "assertion_target", "evaluates_outcome");
          }
        }
      }
    });
  }

  private linkScenarioAssertions(assertions: NonNullable<ScenarioDefinition["assertions"]>): void {
    let idx = 0;
    if (assertions.files) {
      for (const fileAssert of assertions.files) {
        idx++;
        const assertNodeId = `node_assert_file_${idx}`;
        this.addNode({
          id: assertNodeId,
          type: "assertion_outcome",
          label: `File Assert: ${fileAssert.path}`,
          status: "pending",
          artifactPath: fileAssert.path,
          metadata: fileAssert as Record<string, unknown>,
        });
        const latest = this.latestArtifactNode.get(fileAssert.path);
        if (latest) {
          this.addEdge(latest, assertNodeId, "assertion_target", "evaluates_file");
        }
      }
    }

    if (assertions.commands) {
      for (const cmdAssert of assertions.commands) {
        idx++;
        const assertNodeId = `node_assert_cmd_${idx}`;
        this.addNode({
          id: assertNodeId,
          type: "assertion_outcome",
          label: `Cmd Assert: ${cmdAssert.name || cmdAssert.command.slice(0, 30)}`,
          status: "pending",
          metadata: cmdAssert as Record<string, unknown>,
        });
        const lastTool = Object.values(this.nodes)
          .filter((n) => n.type === "tool_invocation")
          .pop();
        if (lastTool) {
          this.addEdge(lastTool.id, assertNodeId, "assertion_target", "evaluates_command");
        }
      }
    }
  }

  private formatToolArgsShort(args: Record<string, unknown>): string {
    if (!args || Object.keys(args).length === 0) return "()";
    if (args.command) {
      const c = String(args.command).replace(/\n/g, " ");
      return `("${c.slice(0, 25)}${c.length > 25 ? "..." : ""}")`;
    }
    if (args.path) {
      return `("${args.path}")`;
    }
    const firstKey = Object.keys(args)[0];
    const val = String(args[firstKey]).slice(0, 20);
    return `(${firstKey}="${val}")`;
  }

  private sanitizeId(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  }
}
