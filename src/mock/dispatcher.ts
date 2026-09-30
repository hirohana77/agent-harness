import { ToolCallResult } from "../core/types.js";
import { CommandExecutor } from "../sandbox/executor.js";
import { WorkspaceManager } from "../sandbox/workspace.js";
import { TrajectoryRecorder } from "../trajectory/recorder.js";
import { MockToolRegistry } from "./registry.js";

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

  constructor(
    mockRegistry: MockToolRegistry,
    executor: CommandExecutor,
    workspace: WorkspaceManager,
    recorder?: TrajectoryRecorder
  ) {
    this.mockRegistry = mockRegistry;
    this.executor = executor;
    this.workspace = workspace;
    this.recorder = recorder;
    this.registerBuiltinTools();
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

    const durationMs = Date.now() - startTime;
    if (this.recorder) {
      this.recorder.recordToolCall(toolName, args, result, durationMs, callId);
    }

    return result;
  }

  public getMockRegistry(): MockToolRegistry {
    return this.mockRegistry;
  }
}
