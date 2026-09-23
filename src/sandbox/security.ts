import path from "node:path";
import { SecurityPolicy } from "../core/types.js";
import { SecurityPolicySchema } from "../core/schemas.js";
import { SecurityViolationError } from "../core/errors.js";

export class SecurityPolicyChecker {
  private policy: SecurityPolicy;
  private workspaceRoot?: string;

  constructor(policy: Partial<SecurityPolicy> = {}, workspaceRoot?: string) {
    this.policy = SecurityPolicySchema.parse(policy);
    if (workspaceRoot) {
      this.workspaceRoot = path.resolve(workspaceRoot);
    }
  }

  public setWorkspaceRoot(root: string): void {
    this.workspaceRoot = path.resolve(root);
  }

  public getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }

  public validateCommand(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    for (const denied of this.policy.deniedCommands) {
      if (this.matchesPattern(trimmed, denied)) {
        throw new SecurityViolationError(
          `Command execution denied by security policy: matches forbidden pattern "${denied}"`,
          { command: trimmed, matchedPattern: denied }
        );
      }
    }

    if (this.policy.allowedCommands.length > 0) {
      const isAllowed = this.policy.allowedCommands.some((allowed) =>
        this.matchesPattern(trimmed, allowed)
      );
      if (!isAllowed) {
        throw new SecurityViolationError(
          `Command execution denied: "${trimmed}" is not in allowedCommands whitelist.`,
          { command: trimmed, allowedPatterns: this.policy.allowedCommands }
        );
      }
    }
  }

  public validatePath(targetPath: string, root?: string): string {
    const base = root ? path.resolve(root) : this.workspaceRoot;
    if (!base) {
      return path.resolve(targetPath);
    }

    const resolvedTarget = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(base, targetPath);
    const relative = path.relative(base, resolvedTarget);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new SecurityViolationError(
        `Path access violation: target "${targetPath}" escapes workspace root "${base}".`,
        { targetPath, workspaceRoot: base }
      );
    }
    return resolvedTarget;
  }

  private matchesPattern(command: string, pattern: string): boolean {
    if (pattern.includes("*")) {
      const regexStr = "^" + pattern.split("*").map(s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join(".*") + "$";
      const regex = new RegExp(regexStr, "i");
      return regex.test(command);
    }
    return command.includes(pattern);
  }
}
