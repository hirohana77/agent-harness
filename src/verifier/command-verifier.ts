import { CommandAssertion, AssertionItemResult } from "../core/types.js";
import { CommandExecutor } from "../sandbox/executor.js";

export class CommandVerifier {
  private executor: CommandExecutor;
  private workspacePath: string;

  constructor(executor: CommandExecutor, workspacePath: string) {
    this.executor = executor;
    this.workspacePath = workspacePath;
  }

  public async verifyOne(assertion: CommandAssertion): Promise<AssertionItemResult> {
    const results = await this.verify([assertion]);
    return results[0];
  }

  public async verify(assertions: CommandAssertion[]): Promise<AssertionItemResult[]> {
    const results: AssertionItemResult[] = [];

    for (const assertion of assertions) {
      const startTime = Date.now();
      const commandName = assertion.name || assertion.command;
      const expectedExitCode = assertion.expectedExitCode ?? 0;

      try {
        const result = await this.executor.execute(assertion.command, {
          cwd: this.workspacePath,
          timeoutMs: assertion.timeoutMs || 30000,
        });

        const actualExitCode = result.exitCode ?? (result.success ? 0 : 1);
        const durationMs = Date.now() - startTime;
        let passed = actualExitCode === expectedExitCode;
        let message = passed
          ? `Command \"${commandName}\" exited with code ${actualExitCode} as expected.`
          : `Command \"${commandName}\" failed: expected exit code ${expectedExitCode}, but got ${actualExitCode}.`;

        if (passed && assertion.stdoutContains) {
          const stdout = result.output || "";
          if (!stdout.includes(assertion.stdoutContains)) {
            passed = false;
            message = `Command \"${commandName}\" output does not contain expected substring \"${assertion.stdoutContains}\".`;
          }
        }

        if (passed && assertion.stderrContains) {
          const stderr = result.error || "";
          if (!stderr.includes(assertion.stderrContains)) {
            passed = false;
            message = `Command \"${commandName}\" stderr does not contain expected substring \"${assertion.stderrContains}\".`;
          }
        }

        results.push({
          type: "command",
          target: assertion.command,
          passed,
          message,
          details: {
            command: assertion.command,
            expectedExitCode,
            actualExitCode,
            stdout: result.output,
            stderr: result.error,
            durationMs,
          },
        });
      } catch (err: any) {
        results.push({
          type: "command",
          target: assertion.command,
          passed: false,
          message: `Command \"${commandName}\" threw an error: ${err.message}`,
          details: { error: err.message },
        });
      }
    }

    return results;
  }
}
