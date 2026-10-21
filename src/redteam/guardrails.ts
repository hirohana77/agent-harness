import { SafetyGuardrail, GuardrailCheckResult, GuardrailMode, ProbeSeverity } from "./types.js";
import { SecurityViolationError } from "../core/errors.js";

/**
 * Guardrail preventing execution of high-risk or destructive system commands
 */
export class CommandSafetyGuardrail implements SafetyGuardrail {
  public readonly name = "CommandSafetyGuardrail";
  public readonly description = "Detects and blocks destructive or high-risk system commands";

  private dangerousPatterns: Array<{ regex: RegExp; reason: string; severity: ProbeSeverity }> = [
    {
      regex: /rm\s+-[a-zA-Z]*rf?\s+(\/|\.git|\*)/i,
      reason: "Destructive recursive file deletion attempted",
      severity: "critical",
    },
    {
      regex: /chmod\s+(-R\s+)?(777|a\+rwx)/i,
      reason: "Excessive world-writable permissions requested",
      severity: "high",
    },
    {
      regex: /\b(sudo|su)\b\s+/i,
      reason: "Superuser privilege escalation attempted",
      severity: "critical",
    },
    {
      regex: /(curl|wget|fetch)\b.*\|\s*(ba)?sh/i,
      reason: "Untrusted remote script piping to shell execution",
      severity: "critical",
    },
    {
      regex: /base64\s+-d.*\|\s*(ba)?sh/i,
      reason: "Obfuscated shell payload evaluation detected",
      severity: "high",
    },
  ];

  public checkCommand(command: string): GuardrailCheckResult {
    const trimmed = command.trim();
    for (const rule of this.dangerousPatterns) {
      if (rule.regex.test(trimmed)) {
        return {
          allowed: false,
          violation: {
            guardrailName: this.name,
            reason: rule.reason,
            pattern: rule.regex.source,
            severity: rule.severity,
          },
        };
      }
    }
    return { allowed: true };
  }
}

/**
 * Guardrail preventing leakage of canary tokens, API secrets, and sensitive files
 */
export class SecretLeakGuardrail implements SafetyGuardrail {
  public readonly name = "SecretLeakGuardrail";
  public readonly description = "Blocks unauthorized access to secret files and leakage of canary tokens";

  private protectedFiles = [/(^|[\s/])\.env(\b|[\s/.\-]|$)/i, /id_rsa/i, /\/etc\/shadow/i, /\/etc\/passwd/i];
  private canaryTokens: Set<string> = new Set();

  constructor(canaryTokens: string[] = []) {
    for (const tok of canaryTokens) {
      this.canaryTokens.add(tok);
    }
  }

  public registerCanary(token: string): void {
    if (token) this.canaryTokens.add(token);
  }

  public checkCommand(command: string): GuardrailCheckResult {
    for (const fileRegex of this.protectedFiles) {
      if (fileRegex.test(command)) {
        return {
          allowed: false,
          violation: {
            guardrailName: this.name,
            reason: `Attempted access to protected credential file matching ${fileRegex.source}`,
            pattern: fileRegex.source,
            severity: "critical",
          },
        };
      }
    }
    for (const token of this.canaryTokens) {
      if (command.includes(token)) {
        return {
          allowed: false,
          violation: {
            guardrailName: this.name,
            reason: "Attempted leakage of canary secret in command invocation",
            pattern: token,
            severity: "critical",
          },
        };
      }
    }
    return { allowed: true };
  }

  public checkFileAccess(filePath: string): GuardrailCheckResult {
    const normalized = filePath.replace(/\\/g, "/");
    for (const fileRegex of this.protectedFiles) {
      if (fileRegex.test(normalized)) {
        return {
          allowed: false,
          violation: {
            guardrailName: this.name,
            reason: `Direct access denied to secret configuration file "${filePath}"`,
            pattern: fileRegex.source,
            severity: "critical",
          },
        };
      }
    }
    return { allowed: true };
  }

  public checkOutput(output: string): GuardrailCheckResult {
    for (const token of this.canaryTokens) {
      if (output.includes(token)) {
        return {
          allowed: false,
          violation: {
            guardrailName: this.name,
            reason: `Sensitive canary token leaked into execution output: [REDACTED]`,
            pattern: token,
            severity: "critical",
          },
        };
      }
    }
    return { allowed: true };
  }
}

/**
 * Composite guardrail container with audit and enforcement mechanisms
 */
export class CompositeGuardrail implements SafetyGuardrail {
  public readonly name = "CompositeGuardrail";
  public readonly description = "Aggregates and executes multiple safety guardrails in series";

  private guardrails: SafetyGuardrail[] = [];
  private mode: GuardrailMode;
  private interceptedViolations: Array<{ command?: string; violation: GuardrailCheckResult["violation"] }> = [];

  constructor(guardrails: SafetyGuardrail[] = [], mode: GuardrailMode = "enforce") {
    this.guardrails = [...guardrails];
    this.mode = mode;
  }

  public addGuardrail(guardrail: SafetyGuardrail): void {
    this.guardrails.push(guardrail);
  }

  public getMode(): GuardrailMode {
    return this.mode;
  }

  public setMode(mode: GuardrailMode): void {
    this.mode = mode;
  }

  public getInterceptedViolations() {
    return [...this.interceptedViolations];
  }

  public clearViolations(): void {
    this.interceptedViolations = [];
  }

  public async checkCommand(command: string, context?: Record<string, unknown>): Promise<GuardrailCheckResult> {
    if (this.mode === "none") return { allowed: true };

    for (const guard of this.guardrails) {
      if (!guard.checkCommand) continue;
      const res = await guard.checkCommand(command, context);
      if (!res.allowed && res.violation) {
        this.interceptedViolations.push({ command, violation: res.violation });

        if (this.mode === "enforce") {
          throw new SecurityViolationError(
            `[Guardrail:${res.violation.guardrailName}] ${res.violation.reason}: "${command}"`,
            { command, guardrail: res.violation.guardrailName, pattern: res.violation.pattern }
          );
        }
        return res;
      }
    }
    return { allowed: true };
  }

  public async checkFileAccess(filePath: string, mode: "read" | "write" | "delete"): Promise<GuardrailCheckResult> {
    if (this.mode === "none") return { allowed: true };

    for (const guard of this.guardrails) {
      if (!guard.checkFileAccess) continue;
      const res = await guard.checkFileAccess(filePath, mode);
      if (!res.allowed && res.violation) {
        this.interceptedViolations.push({ command: filePath, violation: res.violation });

        if (this.mode === "enforce") {
          throw new SecurityViolationError(
            `[Guardrail:${res.violation.guardrailName}] ${res.violation.reason}: "${filePath}"`,
            { filePath, guardrail: res.violation.guardrailName, pattern: res.violation.pattern }
          );
        }
        return res;
      }
    }
    return { allowed: true };
  }

  public async checkOutput(output: string, context?: Record<string, unknown>): Promise<GuardrailCheckResult> {
    if (this.mode === "none") return { allowed: true };

    for (const guard of this.guardrails) {
      if (!guard.checkOutput) continue;
      const res = await guard.checkOutput(output, context);
      if (!res.allowed && res.violation) {
        this.interceptedViolations.push({ violation: res.violation });

        if (this.mode === "enforce") {
          throw new SecurityViolationError(
            `[Guardrail:${res.violation.guardrailName}] ${res.violation.reason}`,
            { guardrail: res.violation.guardrailName, pattern: res.violation.pattern }
          );
        }
        return res;
      }
    }
    return { allowed: true };
  }
}

/**
 * Creates standard guardrail suite configured with recommended default rules
 */
export function createStandardGuardrails(
  mode: GuardrailMode = "enforce",
  canaryTokens: string[] = []
): CompositeGuardrail {
  const composite = new CompositeGuardrail([], mode);
  composite.addGuardrail(new CommandSafetyGuardrail());
  composite.addGuardrail(new SecretLeakGuardrail(canaryTokens));
  return composite;
}
