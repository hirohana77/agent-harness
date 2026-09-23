import { AssertionResult, FileAssertion } from '../core/types.js';
import { WorkspaceManager } from '../sandbox/workspace.js';

export class FileVerifier {
  private workspace: WorkspaceManager;

  constructor(workspace: WorkspaceManager) {
    this.workspace = workspace;
  }

  /**
   * Verify all file assertions
   */
  public async verifyAll(assertions: FileAssertion[]): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];
    for (const assertion of assertions) {
      results.push(await this.verifyOne(assertion));
    }
    return results;
  }

  /**
   * Verify a single file assertion
   */
  public async verifyOne(assertion: FileAssertion): Promise<AssertionResult> {
    const exists = await this.workspace.fileExists(assertion.path);

    if (assertion.shouldExist !== undefined) {
      if (assertion.shouldExist && !exists) {
        return {
          type: 'file',
          target: assertion.path,
          passed: false,
          message: `Expected file "${assertion.path}" to exist, but it was not found.`,
        };
      }
      if (!assertion.shouldExist && exists) {
        return {
          type: 'file',
          target: assertion.path,
          passed: false,
          message: `Expected file "${assertion.path}" to NOT exist, but it was present.`,
        };
      }
    }

    if (!exists) {
      return {
        type: 'file',
        target: assertion.path,
        passed: true,
        message: `File "${assertion.path}" does not exist as expected.`,
      };
    }

    // File exists, check content assertions
    const content = await this.workspace.readFile(assertion.path);

    if (assertion.exactContent !== undefined) {
      if (content.trim() !== assertion.exactContent.trim()) {
        return {
          type: 'file',
          target: assertion.path,
          passed: false,
          message: `File content did not match exact expected content.`,
          details: { expected: assertion.exactContent, actual: content },
        };
      }
    }

    if (assertion.contains !== undefined) {
      const targets = Array.isArray(assertion.contains) ? assertion.contains : [assertion.contains];
      for (const needle of targets) {
        if (!content.includes(needle)) {
          return {
            type: 'file',
            target: assertion.path,
            passed: false,
            message: `File "${assertion.path}" does not contain expected substring: "${needle}"`,
          };
        }
      }
    }

    if (assertion.notContains !== undefined) {
      const targets = Array.isArray(assertion.notContains) ? assertion.notContains : [assertion.notContains];
      for (const needle of targets) {
        if (content.includes(needle)) {
          return {
            type: 'file',
            target: assertion.path,
            passed: false,
            message: `File "${assertion.path}" contains forbidden substring: "${needle}"`,
          };
        }
      }
    }

    if (assertion.matchesRegex !== undefined) {
      const regex = new RegExp(assertion.matchesRegex);
      if (!regex.test(content)) {
        return {
          type: 'file',
          target: assertion.path,
          passed: false,
          message: `File content did not match regex /${assertion.matchesRegex}/`,
        };
      }
    }

    if (assertion.jsonSchema !== undefined) {
      try {
        const json = JSON.parse(content);
        if (typeof json !== 'object' || json === null) {
          return {
            type: 'file',
            target: assertion.path,
            passed: false,
            message: `File is valid JSON but not an object.`,
          };
        }
      } catch (err: unknown) {
        return {
          type: 'file',
          target: assertion.path,
          passed: false,
          message: `File content is not valid JSON: ${(err as Error).message}`,
        };
      }
    }

    return {
      type: 'file',
      target: assertion.path,
      passed: true,
      message: `File assertion passed for "${assertion.path}".`,
    };
  }

  public async verify(assertions: FileAssertion[]): Promise<AssertionResult[]> {
    return this.verifyAll(assertions);
  }
}
