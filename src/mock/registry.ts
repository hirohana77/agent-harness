import { ToolCallResult, AssertionItemResult } from "../core/types.js";
import { MockToolDefinition, MockToolExpectation, MockResponseProvider, ArgsMatcher } from "./types.js";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

export class ToolExpectationBuilder {
  private expectation: MockToolExpectation;

  constructor(toolName: string, id: string) {
    this.expectation = {
      id,
      actualCalls: 0,
      callHistory: [],
      response: { success: true, output: "" },
    };
  }

  public withArgs(expectedArgs: Record<string, unknown> | ArgsMatcher): this {
    if (typeof expectedArgs === "function") {
      this.expectation.matcher = expectedArgs;
    } else {
      this.expectation.matcher = (actualArgs) => {
        for (const [key, value] of Object.entries(expectedArgs)) {
          if (!deepEqual(actualArgs[key], value)) return false;
        }
        return true;
      };
    }
    return this;
  }

  public thenReturn(response: ToolCallResult | string): this {
    if (typeof response === "string") {
      this.expectation.response = { success: true, output: response, exitCode: 0 };
    } else {
      this.expectation.response = response;
    }
    return this;
  }

  public thenCompute(handler: (args: Record<string, unknown>) => Promise<ToolCallResult> | ToolCallResult): this {
    this.expectation.response = handler;
    return this;
  }

  public times(expectedTimes: number): this {
    this.expectation.expectedTimes = expectedTimes;
    return this;
  }

  public getExpectation(): MockToolExpectation {
    return this.expectation;
  }
}

export class MockToolRegistry {
  private tools: Map<string, MockToolDefinition> = new Map();
  private expectations: Map<string, MockToolExpectation[]> = new Map();
  private callHistory: Array<{ toolName: string; args: Record<string, unknown>; timestamp: number }> = [];

  public registerTool(def: MockToolDefinition): this {
    this.tools.set(def.name, def);
    if (!this.expectations.has(def.name)) {
      this.expectations.set(def.name, []);
    }
    return this;
  }

  public hasTool(name: string): boolean {
    return this.tools.has(name) || this.expectations.has(name);
  }

  public expect(toolName: string): ToolExpectationBuilder {
    if (!this.expectations.has(toolName)) {
      this.expectations.set(toolName, []);
    }
    const id = `${toolName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const builder = new ToolExpectationBuilder(toolName, id);
    const expList = this.expectations.get(toolName)!;
    expList.push(builder.getExpectation());
    return builder;
  }

  public async dispatch(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    this.callHistory.push({ toolName, args, timestamp: Date.now() });
    const expList = this.expectations.get(toolName) || [];

    // Find matching expectation
    for (const exp of expList) {
      if (!exp.matcher || exp.matcher(args)) {
        exp.actualCalls++;
        exp.callHistory.push(args);
        if (typeof exp.response === "function") {
          return await exp.response(args);
        }
        return exp.response;
      }
    }

    // Fall back to default response if registered
    const toolDef = this.tools.get(toolName);
    if (toolDef?.defaultResponse) {
      if (typeof toolDef.defaultResponse === "function") {
        return await toolDef.defaultResponse(args);
      }
      return toolDef.defaultResponse;
    }

    return {
      success: false,
      error: `MockToolRegistry: No expectation or default response found for tool "${toolName}" with args ${JSON.stringify(args)}`,
      exitCode: 1,
    };
  }

  public getCallHistory(toolName?: string): Array<{ toolName: string; args: Record<string, unknown> }> {
    if (!toolName) return [...this.callHistory];
    return this.callHistory.filter((c) => c.toolName === toolName);
  }

  public verifyAll(): AssertionItemResult[] {
    const results: AssertionItemResult[] = [];
    for (const [toolName, expList] of this.expectations.entries()) {
      for (const exp of expList) {
        if (exp.expectedTimes !== undefined) {
          const passed = exp.actualCalls === exp.expectedTimes;
          results.push({
            type: "trajectory",
            target: `mock_tool:${toolName}`,
            passed,
            message: passed
              ? `Tool "${toolName}" was called exactly ${exp.expectedTimes} time(s) as expected.`
              : `Tool "${toolName}" expected ${exp.expectedTimes} calls, but got ${exp.actualCalls}.`,
            details: { expectedTimes: exp.expectedTimes, actualCalls: exp.actualCalls, callHistory: exp.callHistory },
          });
        }
      }
    }
    return results;
  }

  public clear(): void {
    this.tools.clear();
    this.expectations.clear();
    this.callHistory = [];
  }
}
