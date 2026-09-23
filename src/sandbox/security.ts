import path from 'node:path';
import { SecurityPolicy } from '../core/types.js';
import { SecurityViolationError } from '../core/errors.js';

export class SecurityPolicyChecker {
  private policy: SecurityPolicy;
  private workspaceRoot: string;

  constructor(policy: SecurityPolicy, workspaceRoot: string) {
    this.policy = policy;
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Validate command against denied and allowed command patterns
   */
  public validateCommand(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    // 1. Check against denied commands
    for (const denied of this.policy.deniedCommands) {
      if (this.matchesPattern(trimmed, denied)) {
        throw new SecurityViolationError(
          `Command rejected by security policy (matches denied rule: "${denied}"): "${command}"`,
          { command, deniedRule: denied }
        );
      }
    }

    // 2. Check against allowed commands (if not wildcard ['*'])
    const isWildcardAllowed = this.policy.allowedCommands.length === 1 && this.policy.allowedCommands[0] === '*';
    if (!isWildcardAllowed) {
      const isAllowed = this.policy.allowedCommands.some((allowed) =>
        this.matchesPattern(trimmed, allowed)
      );
      if (!isAllowed) {
        throw new SecurityViolationError(
          `Command rejected by security policy (not in allowedCommands list): "${command}"`,
          { command, allowedRules: this.policy.allowedCommands }
        );
      }
    }
  }

  /**
   * Validate that a target path stays strictly inside the workspace
   */
  public validatePath(targetPath: string): string {
    const resolved = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(this.workspaceRoot, targetPath);

    const relative = path.relative(this.workspaceRoot, resolved);
    const escapes = relative.startsWith('..') || path.isAbsolute(relative);

    if (escapes) {
      throw new SecurityViolationError(
        `Path traversal detected: "${targetPath}" resolves to outside workspace root "${this.workspaceRoot}"`,
        { targetPath, resolvedPath: resolved, workspaceRoot: this.workspaceRoot }
      );
    }

    return resolved;
  }

  private matchesPattern(input: string, pattern: string): boolean {
    if (pattern === '*' || input === pattern) {
      return true;
    }

    // Escape regex characters except asterisk *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`(^|\\s)${regexPattern}(\\s|$)`, 'i');
    return regex.test(input) || input.includes(pattern);
  }
}
