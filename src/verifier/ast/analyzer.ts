import ts from 'typescript';
import {
  AntiPatternViolation,
  ClassMetadata,
  CodeComplexityAnalysis,
  ExportMetadata,
  ForbiddenSyntaxKind,
  FunctionMetadata,
  ImportMetadata,
  InterfaceMetadata,
  TypeAliasMetadata,
} from './types.js';

export class ASTAnalyzer {
  private sourceFile: ts.SourceFile;

  constructor(sourceFile: ts.SourceFile) {
    this.sourceFile = sourceFile;
  }

  /**
   * Helper to check if a node has the export modifier
   */
  private isExported(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
  }

  /**
   * Helper to check if a node has the async modifier
   */
  private isAsync(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
  }

  /**
   * Helper to check if a node has the static modifier
   */
  private isStatic(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword));
  }

  /**
   * Helper to check if a node has the abstract modifier
   */
  private isAbstract(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword));
  }

  /**
   * Extract line number (1-based) from node position
   */
  private getLine(node: ts.Node): number {
    return this.sourceFile.getLineAndCharacterOfPosition(node.getStart(this.sourceFile)).line + 1;
  }

  /**
   * Calculate cyclomatic complexity for a function body
   */
  public calculateFunctionComplexity(node: ts.Node): number {
    let complexity = 1;

    const visit = (child: ts.Node) => {
      switch (child.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
          complexity++;
          break;
        case ts.SyntaxKind.BinaryExpression: {
          const bin = child as ts.BinaryExpression;
          if (
            bin.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            bin.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            bin.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          ) {
            complexity++;
          }
          break;
        }
      }
      ts.forEachChild(child, visit);
    };

    ts.forEachChild(node, visit);
    return complexity;
  }

  /**
   * Find all function declarations, arrow functions, and method declarations
   */
  public findFunctions(): FunctionMetadata[] {
    const functions: FunctionMetadata[] = [];
    const exportedIdentifiers = this.getExportedIdentifierNames();

    const visit = (node: ts.Node) => {
      // 1. Regular function declaration
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        const isExported = this.isExported(node) || exportedIdentifiers.has(name);
        functions.push({
          name,
          isAsync: this.isAsync(node),
          isGenerator: Boolean(node.asteriskToken),
          isExported,
          params: node.parameters.map((p) => p.name.getText(this.sourceFile)),
          returnType: node.type?.getText(this.sourceFile),
          startLine: this.getLine(node),
          cyclomaticComplexity: node.body ? this.calculateFunctionComplexity(node.body) : 1,
        });
      }

      // 2. Variable declaration with function or arrow function
      if (ts.isVariableStatement(node)) {
        const statementExported = this.isExported(node);
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            const name = decl.name.getText(this.sourceFile);
            const fnInit = decl.initializer;
            const isExported = statementExported || exportedIdentifiers.has(name);
            functions.push({
              name,
              isAsync: this.isAsync(fnInit),
              isGenerator: Boolean((fnInit as any).asteriskToken),
              isExported,
              params: fnInit.parameters.map((p) => p.name.getText(this.sourceFile)),
              returnType: fnInit.type?.getText(this.sourceFile),
              startLine: this.getLine(decl),
              cyclomaticComplexity: fnInit.body ? this.calculateFunctionComplexity(fnInit.body) : 1,
            });
          }
        }
      }

      // 3. Class method declaration
      if (ts.isMethodDeclaration(node) && node.name) {
        const name = node.name.getText(this.sourceFile);
        functions.push({
          name,
          isAsync: this.isAsync(node),
          isGenerator: Boolean(node.asteriskToken),
          isExported: false,
          params: node.parameters.map((p) => p.name.getText(this.sourceFile)),
          returnType: node.type?.getText(this.sourceFile),
          startLine: this.getLine(node),
          cyclomaticComplexity: node.body ? this.calculateFunctionComplexity(node.body) : 1,
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return functions;
  }

  /**
   * Find all class declarations
   */
  public findClasses(): ClassMetadata[] {
    const classes: ClassMetadata[] = [];
    const exportedIdentifiers = this.getExportedIdentifierNames();

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const isExported = this.isExported(node) || exportedIdentifiers.has(name);
        const isAbstract = this.isAbstract(node);

        let extendsClass: string | undefined;
        const implementsInterfaces: string[] = [];

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
              extendsClass = clause.types[0]?.expression.getText(this.sourceFile);
            } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
              for (const t of clause.types) {
                implementsInterfaces.push(t.expression.getText(this.sourceFile));
              }
            }
          }
        }

        const methods: Array<{ name: string; isAsync: boolean; isStatic: boolean }> = [];
        const properties: string[] = [];

        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            methods.push({
              name: member.name.getText(this.sourceFile),
              isAsync: this.isAsync(member),
              isStatic: this.isStatic(member),
            });
          } else if (ts.isPropertyDeclaration(member) && member.name) {
            properties.push(member.name.getText(this.sourceFile));
          }
        }

        classes.push({
          name,
          isExported,
          isAbstract,
          extendsClass,
          implementsInterfaces,
          methods,
          properties,
          startLine: this.getLine(node),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return classes;
  }

  /**
   * Find TypeScript interface declarations
   */
  public findInterfaces(): InterfaceMetadata[] {
    const interfaces: InterfaceMetadata[] = [];
    const exportedIdentifiers = this.getExportedIdentifierNames();

    const visit = (node: ts.Node) => {
      if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const isExported = this.isExported(node) || exportedIdentifiers.has(name);
        const extendsInterfaces: string[] = [];

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
              for (const t of clause.types) {
                extendsInterfaces.push(t.expression.getText(this.sourceFile));
              }
            }
          }
        }

        const properties: Array<{ name: string; type?: string; optional: boolean }> = [];
        for (const member of node.members) {
          if (ts.isPropertySignature(member) && member.name) {
            properties.push({
              name: member.name.getText(this.sourceFile),
              type: member.type?.getText(this.sourceFile),
              optional: Boolean(member.questionToken),
            });
          }
        }

        interfaces.push({
          name,
          isExported,
          extendsInterfaces,
          properties,
          startLine: this.getLine(node),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return interfaces;
  }

  /**
   * Find TypeScript type alias declarations
   */
  public findTypeAliases(): TypeAliasMetadata[] {
    const aliases: TypeAliasMetadata[] = [];
    const exportedIdentifiers = this.getExportedIdentifierNames();

    const visit = (node: ts.Node) => {
      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        const isExported = this.isExported(node) || exportedIdentifiers.has(name);
        aliases.push({
          name,
          isExported,
          startLine: this.getLine(node),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return aliases;
  }

  /**
   * Find import declarations
   */
  public findImports(): ImportMetadata[] {
    const imports: ImportMetadata[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const module = node.moduleSpecifier.getText(this.sourceFile).replace(/^['"]|['"]$/g, '');
        let defaultImport: string | undefined;
        const namedImports: string[] = [];
        let namespaceImport: string | undefined;

        if (node.importClause) {
          if (node.importClause.name) {
            defaultImport = node.importClause.name.text;
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                namedImports.push(element.name.text);
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              namespaceImport = node.importClause.namedBindings.name.text;
            }
          }
        }

        imports.push({
          module,
          defaultImport,
          namedImports,
          namespaceImport,
          startLine: this.getLine(node),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return imports;
  }

  /**
   * Find export statements
   */
  public findExports(): ExportMetadata[] {
    const exportsList: ExportMetadata[] = [];

    const visit = (node: ts.Node) => {
      // 1. Export declaration: export { a, b as c }
      if (ts.isExportDeclaration(node)) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            exportsList.push({
              name: el.name.text,
              isDefault: el.name.text === 'default',
              startLine: this.getLine(el),
            });
          }
        }
      }

      // 2. Export assignment: export default ...
      if (ts.isExportAssignment(node)) {
        exportsList.push({
          name: node.expression.getText(this.sourceFile),
          isDefault: true,
          startLine: this.getLine(node),
        });
      }

      // 3. Declarations with export keyword
      if (this.isExported(node)) {
        const isDefault = Boolean(
          ts.canHaveModifiers(node) &&
            ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
        );

        if (ts.isFunctionDeclaration(node) && node.name) {
          exportsList.push({
            name: node.name.text,
            isDefault,
            startLine: this.getLine(node),
          });
        } else if (ts.isClassDeclaration(node) && node.name) {
          exportsList.push({
            name: node.name.text,
            isDefault,
            startLine: this.getLine(node),
          });
        } else if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            exportsList.push({
              name: decl.name.getText(this.sourceFile),
              isDefault: false,
              startLine: this.getLine(decl),
            });
          }
        } else if (ts.isTypeAliasDeclaration(node)) {
          exportsList.push({
            name: node.name.text,
            isDefault: false,
            startLine: this.getLine(node),
          });
        } else if (ts.isInterfaceDeclaration(node)) {
          exportsList.push({
            name: node.name.text,
            isDefault: false,
            startLine: this.getLine(node),
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return exportsList;
  }

  /**
   * Helper set of identifiers exported via `export { ... }`
   */
  private getExportedIdentifierNames(): Set<string> {
    const set = new Set<string>();
    for (const statement of this.sourceFile.statements) {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const el of statement.exportClause.elements) {
          set.add(el.name.text);
        }
      }
    }
    return set;
  }

  /**
   * Detect code anti-patterns and forbidden syntax structures
   */
  public detectAntiPatterns(forbidden: ForbiddenSyntaxKind[]): AntiPatternViolation[] {
    const violations: AntiPatternViolation[] = [];
    const forbiddenSet = new Set(forbidden);

    const visit = (node: ts.Node, parent?: ts.Node) => {
      const lineAndChar = this.sourceFile.getLineAndCharacterOfPosition(node.getStart(this.sourceFile));
      const line = lineAndChar.line + 1;
      const column = lineAndChar.character + 1;

      // 1. eval
      if (forbiddenSet.has('eval') && ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
          violations.push({
            kind: 'eval',
            message: 'Forbidden eval() invocation detected',
            line,
            column,
          });
        }
      }

      // 2. debugger
      if (forbiddenSet.has('debugger') && ts.isDebuggerStatement(node)) {
        violations.push({
          kind: 'debugger',
          message: 'Forbidden debugger statement detected',
          line,
          column,
        });
      }

      // 3. console
      if (forbiddenSet.has('console') && ts.isCallExpression(node)) {
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'console'
        ) {
          violations.push({
            kind: 'console',
            message: `Forbidden console.${node.expression.name.text}() call detected`,
            line,
            column,
          });
        }
      }

      // 4. any_type
      if (forbiddenSet.has('any_type') && node.kind === ts.SyntaxKind.AnyKeyword) {
        violations.push({
          kind: 'any_type',
          message: 'Forbidden explicit "any" type annotation detected',
          line,
          column,
        });
      }

      // 5. var_declaration
      if (forbiddenSet.has('var_declaration') && ts.isVariableDeclarationList(node)) {
        // Var declarations have neither Let nor Const flag
        const isLetOrConst = Boolean(node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const));
        if (!isLetOrConst) {
          violations.push({
            kind: 'var_declaration',
            message: 'Forbidden "var" declaration detected; use let or const',
            line,
            column,
          });
        }
      }

      // 6. empty_catch
      if (forbiddenSet.has('empty_catch') && ts.isCatchClause(node)) {
        if (node.block.statements.length === 0) {
          violations.push({
            kind: 'empty_catch',
            message: 'Forbidden empty catch block detected',
            line,
            column,
          });
        }
      }

      // 7. nested_ternary
      if (forbiddenSet.has('nested_ternary') && ts.isConditionalExpression(node)) {
        if (parent && ts.isConditionalExpression(parent)) {
          violations.push({
            kind: 'nested_ternary',
            message: 'Forbidden nested ternary conditional expression detected',
            line,
            column,
          });
        }
      }

      ts.forEachChild(node, (child) => visit(child, node));
    };

    visit(this.sourceFile);
    return violations;
  }

  /**
   * Compute max AST nesting depth and function complexities
   */
  public computeComplexity(): CodeComplexityAnalysis {
    let maxDepth = 0;

    const computeDepth = (node: ts.Node, currentDepth: number) => {
      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }
      ts.forEachChild(node, (child) => computeDepth(child, currentDepth + 1));
    };
    computeDepth(this.sourceFile, 1);

    const functions = this.findFunctions();
    const funcComplexities: Record<string, number> = {};
    let maxFunctionComplexity = 0;

    for (const fn of functions) {
      funcComplexities[fn.name] = fn.cyclomaticComplexity;
      if (fn.cyclomaticComplexity > maxFunctionComplexity) {
        maxFunctionComplexity = fn.cyclomaticComplexity;
      }
    }

    return {
      maxDepth,
      functions: funcComplexities,
      maxFunctionComplexity,
    };
  }

  /**
   * Count occurrences of a specific SyntaxKind by string name
   */
  public countSyntaxKind(kindName: string): number {
    let count = 0;
    const targetKind = (ts.SyntaxKind as any)[kindName];

    const visit = (node: ts.Node) => {
      if (targetKind !== undefined) {
        if (node.kind === targetKind) {
          count++;
        }
      } else if (ts.SyntaxKind[node.kind] === kindName) {
        count++;
      }
      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return count;
  }
}
