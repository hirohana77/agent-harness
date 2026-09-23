/**
 * Error hierarchy for agent-harness
 */

export class HarnessError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'HARNESS_ERROR', details?: unknown) {
    super(message);
    this.name = 'HarnessError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SecurityViolationError extends HarnessError {
  constructor(message: string, details?: unknown) {
    super(message, 'SECURITY_VIOLATION', details);
    this.name = 'SecurityViolationError';
  }
}

export class BudgetExceededError extends HarnessError {
  constructor(message: string, details?: unknown) {
    super(message, 'BUDGET_EXCEEDED', details);
    this.name = 'BudgetExceededError';
  }
}

export class ScenarioValidationError extends HarnessError {
  constructor(message: string, details?: unknown) {
    super(message, 'SCENARIO_VALIDATION_ERROR', details);
    this.name = 'ScenarioValidationError';
  }
}

export class WorkspaceError extends HarnessError {
  constructor(message: string, details?: unknown) {
    super(message, 'WORKSPACE_ERROR', details);
    this.name = 'WorkspaceError';
  }
}

export class HarnessAssertionError extends HarnessError {
  constructor(message: string, details?: unknown) {
    super(message, 'ASSERTION_ERROR', details);
    this.name = 'HarnessAssertionError';
  }
}
