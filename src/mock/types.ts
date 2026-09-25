import { ToolCallResult, AssertionItemResult } from "../core/types.js";

export type ArgsMatcher = (args: Record<string, unknown>) => boolean;

export type MockResponseProvider =
  | ToolCallResult
  | ((args: Record<string, unknown>) => Promise<ToolCallResult> | ToolCallResult);

export interface MockToolExpectation {
  id: string;
  matcher?: ArgsMatcher;
  response: MockResponseProvider;
  expectedTimes?: number;
  actualCalls: number;
  callHistory: Array<Record<string, unknown>>;
}

export interface MockToolDefinition {
  name: string;
  description?: string;
  defaultResponse?: MockResponseProvider;
}
