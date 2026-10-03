import { AssertionItemResult, ASTAssertion, ASTAssertionRule } from '../core/types.js';
import { WorkspaceManager } from '../sandbox/workspace.js';
import { ASTAnalyzer } from './ast/analyzer.js';
import { ASTParser } from './ast/parser.js';

export class ASTVerifier {
  private workspace: WorkspaceManager;

  constructor(workspace: WorkspaceManager) {
    this.workspace = workspace;
  }

  /**
   * Verify an array of AST assertions across workspace files
   */
  public async verify(assertions: ASTAssertion[]): Promise<AssertionItemResult[]> {
    return this.verifyAll(assertions);
  }

  /**
   * Verify all AST assertions
   */
  public async verifyAll(assertions: ASTAssertion[]): Promise<AssertionItemResult[]> {
    const results: AssertionItemResult[] = [];
    for (const assertion of assertions) {
      const itemResults = await this.verifyOne(assertion);
      results.push(...itemResults);
    }
    return results;
  }

  /**
   * Verify a single file's AST assertions
   */
  public async verifyOne(assertion: ASTAssertion): Promise<AssertionItemResult[]> {
    const exists = await this.workspace.fileExists(assertion.path);
    if (!exists) {
      return [
        {
          type: 'ast',
          target: `${assertion.path} [exists]`,
          passed: false,
          message: `Target file "${assertion.path}" does not exist for AST assertion.`,
          details: { path: assertion.path },
        },
      ];
    }

    let code: string;
    try {
      code = await this.workspace.readFile(assertion.path);
    } catch (err: any) {
      return [
        {
          type: 'ast',
          target: `${assertion.path} [read]`,
          passed: false,
          message: `Failed to read file "${assertion.path}": ${err.message}`,
        },
      ];
    }

    const sourceFile = ASTParser.parse(assertion.path, code);
    const analyzer = new ASTAnalyzer(sourceFile);
    const results: AssertionItemResult[] = [];

    for (const rule of assertion.rules) {
      const result = this.evaluateRule(assertion.path, rule, analyzer);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate a single AST assertion rule on an analyzed file
   */
  public evaluateRule(filePath: string, rule: ASTAssertionRule, analyzer: ASTAnalyzer): AssertionItemResult {
    const targetTag = `${filePath} [${rule.rule}]`;

    switch (rule.rule) {
      case 'has_function': {
        const functions = analyzer.findFunctions();
        const found = functions.find((f) => f.name === rule.name);

        if (!found) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: rule.description || `Expected function "${rule.name}" was not found in ${filePath}.`,
            details: { expectedFunction: rule.name, foundFunctions: functions.map((f) => f.name) },
          };
        }

        if (rule.isAsync !== undefined && found.isAsync !== rule.isAsync) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Function "${rule.name}" async status mismatch: expected ${rule.isAsync}, got ${found.isAsync}.`,
            details: { expectedAsync: rule.isAsync, actualAsync: found.isAsync },
          };
        }

        if (rule.isGenerator !== undefined && found.isGenerator !== rule.isGenerator) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Function "${rule.name}" generator status mismatch: expected ${rule.isGenerator}, got ${found.isGenerator}.`,
            details: { expectedGenerator: rule.isGenerator, actualGenerator: found.isGenerator },
          };
        }

        if (rule.isExported !== undefined && found.isExported !== rule.isExported) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Function "${rule.name}" export status mismatch: expected ${rule.isExported}, got ${found.isExported}.`,
            details: { expectedExported: rule.isExported, actualExported: found.isExported },
          };
        }

        if (rule.minParams !== undefined && found.params.length < rule.minParams) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Function "${rule.name}" has ${found.params.length} parameters, expected at least ${rule.minParams}.`,
            details: { actualParams: found.params },
          };
        }

        if (rule.maxParams !== undefined && found.params.length > rule.maxParams) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Function "${rule.name}" has ${found.params.length} parameters, expected at most ${rule.maxParams}.`,
            details: { actualParams: found.params },
          };
        }

        if (rule.paramNames && rule.paramNames.length > 0) {
          for (let i = 0; i < rule.paramNames.length; i++) {
            if (found.params[i] !== rule.paramNames[i]) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Function "${rule.name}" parameter at index ${i} was "${found.params[i]}", expected "${rule.paramNames[i]}".`,
                details: { actualParams: found.params, expectedParams: rule.paramNames },
              };
            }
          }
        }

        if (rule.returnType && (!found.returnType || !found.returnType.includes(rule.returnType))) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Function "${rule.name}" return type was "${found.returnType || 'none'}", expected "${rule.returnType}".`,
            details: { actualReturnType: found.returnType, expectedReturnType: rule.returnType },
          };
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `Function "${rule.name}" satisfies AST contract.`,
          details: { function: found },
        };
      }

      case 'has_class': {
        const classes = analyzer.findClasses();
        const found = classes.find((c) => c.name === rule.name);

        if (!found) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: rule.description || `Expected class "${rule.name}" was not found in ${filePath}.`,
            details: { expectedClass: rule.name, foundClasses: classes.map((c) => c.name) },
          };
        }

        if (rule.isExported !== undefined && found.isExported !== rule.isExported) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Class "${rule.name}" export status mismatch: expected ${rule.isExported}, got ${found.isExported}.`,
          };
        }

        if (rule.isAbstract !== undefined && found.isAbstract !== rule.isAbstract) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Class "${rule.name}" abstract status mismatch: expected ${rule.isAbstract}, got ${found.isAbstract}.`,
          };
        }

        if (rule.extendsClass !== undefined && found.extendsClass !== rule.extendsClass) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Class "${rule.name}" extends "${found.extendsClass || 'none'}", expected "${rule.extendsClass}".`,
          };
        }

        if (rule.implementsInterfaces && rule.implementsInterfaces.length > 0) {
          for (const iface of rule.implementsInterfaces) {
            if (!found.implementsInterfaces.includes(iface)) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Class "${rule.name}" does not implement expected interface "${iface}".`,
                details: { actualImplements: found.implementsInterfaces },
              };
            }
          }
        }

        if (rule.methods && rule.methods.length > 0) {
          for (const expectedMethod of rule.methods) {
            const m = found.methods.find((item) => item.name === expectedMethod.name);
            if (!m) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Class "${rule.name}" is missing method "${expectedMethod.name}".`,
              };
            }
            if (expectedMethod.isAsync !== undefined && m.isAsync !== expectedMethod.isAsync) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Method "${expectedMethod.name}" in class "${rule.name}" async mismatch: expected ${expectedMethod.isAsync}, got ${m.isAsync}.`,
              };
            }
            if (expectedMethod.isStatic !== undefined && m.isStatic !== expectedMethod.isStatic) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Method "${expectedMethod.name}" in class "${rule.name}" static mismatch: expected ${expectedMethod.isStatic}, got ${m.isStatic}.`,
              };
            }
          }
        }

        if (rule.properties && rule.properties.length > 0) {
          for (const prop of rule.properties) {
            if (!found.properties.includes(prop)) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Class "${rule.name}" is missing expected property "${prop}".`,
                details: { actualProperties: found.properties },
              };
            }
          }
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `Class "${rule.name}" satisfies AST contract.`,
          details: { class: found },
        };
      }

      case 'has_interface': {
        const interfaces = analyzer.findInterfaces();
        const found = interfaces.find((i) => i.name === rule.name);

        if (!found) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: rule.description || `Expected interface "${rule.name}" was not found in ${filePath}.`,
          };
        }

        if (rule.isExported !== undefined && found.isExported !== rule.isExported) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Interface "${rule.name}" export status mismatch: expected ${rule.isExported}, got ${found.isExported}.`,
          };
        }

        if (rule.extendsInterfaces && rule.extendsInterfaces.length > 0) {
          for (const ext of rule.extendsInterfaces) {
            if (!found.extendsInterfaces.includes(ext)) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Interface "${rule.name}" does not extend "${ext}".`,
              };
            }
          }
        }

        if (rule.properties && rule.properties.length > 0) {
          for (const expProp of rule.properties) {
            const actual = found.properties.find((p) => p.name === expProp.name);
            if (!actual) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Interface "${rule.name}" is missing expected property "${expProp.name}".`,
              };
            }
            if (expProp.optional !== undefined && actual.optional !== expProp.optional) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Property "${expProp.name}" optional status mismatch: expected ${expProp.optional}, got ${actual.optional}.`,
              };
            }
            if (expProp.type !== undefined && actual.type && !actual.type.includes(expProp.type)) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Property "${expProp.name}" type mismatch: expected "${expProp.type}", got "${actual.type}".`,
              };
            }
          }
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `Interface "${rule.name}" satisfies AST contract.`,
          details: { interface: found },
        };
      }

      case 'has_type_alias': {
        const aliases = analyzer.findTypeAliases();
        const found = aliases.find((a) => a.name === rule.name);

        if (!found) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: rule.description || `Expected type alias "${rule.name}" was not found in ${filePath}.`,
          };
        }

        if (rule.isExported !== undefined && found.isExported !== rule.isExported) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Type alias "${rule.name}" export status mismatch: expected ${rule.isExported}, got ${found.isExported}.`,
          };
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `Type alias "${rule.name}" satisfies AST contract.`,
        };
      }

      case 'has_import': {
        const imports = analyzer.findImports();
        const found = imports.find((i) => i.module === rule.module);

        if (!found) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: rule.description || `Expected import from module "${rule.module}" was not found in ${filePath}.`,
            details: { foundModules: imports.map((i) => i.module) },
          };
        }

        if (rule.defaultImport && found.defaultImport !== rule.defaultImport) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Import from "${rule.module}" default specifier was "${found.defaultImport || 'none'}", expected "${rule.defaultImport}".`,
          };
        }

        if (rule.namespaceImport && found.namespaceImport !== rule.namespaceImport) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Import from "${rule.module}" namespace specifier was "${found.namespaceImport || 'none'}", expected "${rule.namespaceImport}".`,
          };
        }

        if (rule.namedImports && rule.namedImports.length > 0) {
          for (const named of rule.namedImports) {
            if (!found.namedImports.includes(named)) {
              return {
                type: 'ast',
                target: targetTag,
                passed: false,
                message: `Import from "${rule.module}" is missing named import "${named}".`,
                details: { actualNamedImports: found.namedImports },
              };
            }
          }
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `Import from "${rule.module}" satisfies AST contract.`,
          details: { import: found },
        };
      }

      case 'has_export': {
        const exportsList = analyzer.findExports();
        const found = exportsList.find((e) => e.name === rule.name);

        if (!found) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: rule.description || `Expected export "${rule.name}" was not found in ${filePath}.`,
            details: { foundExports: exportsList.map((e) => e.name) },
          };
        }

        if (rule.isDefault !== undefined && found.isDefault !== rule.isDefault) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message: `Export "${rule.name}" default status mismatch: expected ${rule.isDefault}, got ${found.isDefault}.`,
          };
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `Export "${rule.name}" satisfies AST contract.`,
        };
      }

      case 'no_forbidden_syntax': {
        const violations = analyzer.detectAntiPatterns(rule.forbidden);

        if (violations.length > 0) {
          const sample = violations
            .slice(0, 3)
            .map((v) => `${v.message} (line ${v.line}:${v.column})`)
            .join('; ');
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message:
              rule.description ||
              `Detected ${violations.length} forbidden syntax violation(s) in ${filePath}: ${sample}`,
            details: { violations },
          };
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `No forbidden syntax detected (${rule.forbidden.join(', ')}).`,
        };
      }

      case 'complexity': {
        const analysis = analyzer.computeComplexity();

        if (rule.maxCyclomaticComplexity !== undefined && analysis.maxFunctionComplexity > rule.maxCyclomaticComplexity) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message:
              rule.description ||
              `Max function cyclomatic complexity ${analysis.maxFunctionComplexity} exceeds allowed limit ${rule.maxCyclomaticComplexity}.`,
            details: { analysis },
          };
        }

        if (rule.maxAstDepth !== undefined && analysis.maxDepth > rule.maxAstDepth) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message:
              rule.description ||
              `Max AST depth ${analysis.maxDepth} exceeds allowed limit ${rule.maxAstDepth}.`,
            details: { analysis },
          };
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message:
            rule.description ||
            `Code complexity within thresholds (max depth: ${analysis.maxDepth}, max func complexity: ${analysis.maxFunctionComplexity}).`,
          details: { analysis },
        };
      }

      case 'custom_query': {
        const count = analyzer.countSyntaxKind(rule.syntaxKind);

        if (rule.minCount !== undefined && count < rule.minCount) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message:
              rule.description ||
              `AST node count for "${rule.syntaxKind}" is ${count}, expected at least ${rule.minCount}.`,
            details: { count, expectedMin: rule.minCount },
          };
        }

        if (rule.maxCount !== undefined && count > rule.maxCount) {
          return {
            type: 'ast',
            target: targetTag,
            passed: false,
            message:
              rule.description ||
              `AST node count for "${rule.syntaxKind}" is ${count}, expected at most ${rule.maxCount}.`,
            details: { count, expectedMax: rule.maxCount },
          };
        }

        return {
          type: 'ast',
          target: targetTag,
          passed: true,
          message: rule.description || `AST node query for "${rule.syntaxKind}" matched count ${count}.`,
          details: { count },
        };
      }

      default: {
        return {
          type: 'ast',
          target: targetTag,
          passed: false,
          message: `Unknown AST assertion rule: ${(rule as any).rule}`,
        };
      }
    }
  }
}
