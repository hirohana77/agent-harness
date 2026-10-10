import { ToolCallResult } from "../core/types.js";
import { CommandExecutor } from "../sandbox/executor.js";
import { WorkspaceManager } from "../sandbox/workspace.js";
import { TrajectoryRecorder } from "../trajectory/recorder.js";
import { MockToolRegistry } from "./registry.js";
import { SteeringController } from "../steering/controller.js";
import { ChaosEngine } from "../chaos/engine.js";

export type NativeToolHandler = (
  args: Record<string, unknown>,
  context: { workspace: WorkspaceManager; executor: CommandExecutor }
) => Promise<ToolCallResult> | ToolCallResult;

export class VirtualToolDispatcher {
  private mockRegistry: MockToolRegistry;
  private executor: CommandExecutor;
  private workspace: WorkspaceManager;
  private recorder?: TrajectoryRecorder;
  private nativeTools: Map<string, NativeToolHandler> = new Map();
  private steering?: SteeringController;
  private chaos?: ChaosEngine;

  constructor(
    mockRegistry: MockToolRegistry,
    executor: CommandExecutor,
    workspace: WorkspaceManager,
    recorder?: TrajectoryRecorder,
    steering?: SteeringController,
    chaos?: ChaosEngine
  ) {
    this.mockRegistry = mockRegistry;
    this.executor = executor;
    this.workspace = workspace;
    this.recorder = recorder;
    this.steering = steering;
    this.chaos = chaos;
    this.registerBuiltinTools();
  }

  public setSteeringController(steering: SteeringController): this {
    this.steering = steering;
    return this;
  }

  public getSteeringController(): SteeringController | undefined {
    return this.steering;
  }

  public setChaosEngine(chaos: ChaosEngine): this {
    this.chaos = chaos;
    return this;
  }

  public getChaosEngine(): ChaosEngine | undefined {
    return this.chaos;
  }

  private registerBuiltinTools(): void {
    // 1. exec_command tool
    this.registerNativeTool("exec_command", async (args) => {
      const cmd = String(args.command || args.cmd || "");
      return await this.executor.execute(cmd);
    });

    // 2. read_file tool
    this.registerNativeTool("read_file", async (args) => {
      const relPath = String(args.path || args.file || "");
      try {
        const content = await this.workspace.readFile(relPath);
        return { success: true, output: content, exitCode: 0 };
      } catch (err: any) {
        return { success: false, error: err.message, exitCode: 1 };
      }
    });

    // 3. write_file tool
    this.registerNativeTool("write_file", async (args) => {
      const relPath = String(args.path || args.file || "");
      const content = String(args.content ?? "");
      try {
        await this.workspace.writeFile(relPath, content);
        return { success: true, output: `Wrote ${content.length} bytes to ${relPath}`, exitCode: 0 };
      } catch (err: any) {
        return { success: false, error: err.message, exitCode: 1 };
      }
    });
  }

  public registerNativeTool(name: string, handler: NativeToolHandler): this {
    this.nativeTools.set(name, handler);
    return this;
  }

  public async call(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const startTime = Date.now();
    const callId = this.recorder?.notifyToolStart(toolName, args);
    let result: ToolCallResult;

    // 1. Chaos pre-interceptor hook
    if (this.chaos) {
      const chaosDecision = await this.chaos.interceptBefore(toolName, args);
      if (chaosDecision && chaosDecision.outputOverride) {
        result = chaosDecision.outputOverride;
        const durationMs = Date.now() - startTime + (chaosDecision.latencyMs ?? 0);
        if (this.recorder) {
          this.recorder.recordToolCall(toolName, args, result, durationMs, callId);
        }
        this.chaos.recordToolResult(toolName, args, result);
        if (this.steering) {
          if (result.success) {
            this.steering.recordSuccess();
          } else {
            this.steering.recordError();
          }
        }
        return result;
      }
    }

    // 2. Steering interceptor hook
    if (this.steering) {
      const decision = await this.steering.interceptTool(toolName, args);
      if (!decision.shouldExecuteNative) {
        result =
          decision.overrideResult ||
          decision.skipResult || {
            success: true,
            output: `Tool "${toolName}" handled by steering`,
            exitCode: 0,
          };
        const durationMs = Date.now() - startTime;
        if (this.recorder) {
          this.recorder.recordToolCall(toolName, args, result, durationMs, callId);
        }
        if (this.chaos) {
          this.chaos.recordToolResult(toolName, args, result);
        }
        if (result.success) {
          this.steering.recordSuccess();
        } else {
          this.steering.recordError();
        }
        return result;
      }
    }

    // Route 1: Mock registry (if registered or mocked)
    if (this.mockRegistry.hasTool(toolName)) {
      result = await this.mockRegistry.dispatch(toolName, args);
    }
    // Route 2: Native built-in tool
    else if (this.nativeTools.has(toolName)) {
      try {
        const handler = this.nativeTools.get(toolName)!;
        result = await handler(args, { workspace: this.workspace, executor: this.executor });
      } catch (err: any) {
        result = { success: false, error: err.message, exitCode: 1 };
      }
    }
    // Route 3: Unknown tool
    else {
      result = {
        success: false,
        error: `Tool "${toolName}" is not registered in mock registry or native toolset.`,
        exitCode: 127,
      };
    }

    // 3. Chaos post-interceptor hook (corruption, adversarial prompts)
    if (this.chaos) {
      result = await this.chaos.interceptAfter(toolName, args, result);
      this.chaos.recordToolResult(toolName, args, result);
    }

    const durationMs = Date.now() - startTime;
    if (this.recorder) {
      this.recorder.recordToolCall(toolName, args, result, durationMs, callId);
    }

    if (this.steering) {
      if (result.success) {
        this.steering.recordSuccess();
      } else {
        this.steering.recordError();
      }
    }

    return result;
  }

  public getMockRegistry(): MockToolRegistry {
    return this.mockRegistry;
  }
}
