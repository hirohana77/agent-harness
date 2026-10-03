/**
 * AST semantic assertion and code structure contract definitions.
 */

export type ForbiddenSyntaxKind =
  | 'eval'
  | 'debugger'
  | 'console'
  | 'any_type'
  | 'var_declaration'
  | 'empty_catch'
  | 'nested_ternary';

export interface MethodSignatureExpectation {
  name: string;
  isAsync?: boolean;
  isStatic?: boolean;
}

export interface PropertySignatureExpectation {
  name: string;
  type?: string;
  optional?: boolean;
}

export interface FunctionAssertionRule {
  rule: 'has_function';
  name: string;
  isAsync?: boolean;
  isGenerator?: boolean;
  isExported?: boolean;
  minParams?: number;
  maxParams?: number;
  paramNames?: string[];
  returnType?: string;
  description?: string;
}

export interface ClassAssertionRule {
  rule: 'has_class';
  name: string;
  isExported?: boolean;
  isAbstract?: boolean;
  extendsClass?: string;
  implementsInterfaces?: string[];
  methods?: MethodSignatureExpectation[];
  properties?: string[];
  description?: string;
}

export interface InterfaceAssertionRule {
  rule: 'has_interface';
  name: string;
  isExported?: boolean;
  extendsInterfaces?: string[];
  properties?: PropertySignatureExpectation[];
  description?: string;
}

export interface TypeAliasAssertionRule {
  rule: 'has_type_alias';
  name: string;
  isExported?: boolean;
  description?: string;
}

export interface ImportAssertionRule {
  rule: 'has_import';
  module: string;
  defaultImport?: string;
  namedImports?: string[];
  namespaceImport?: string;
  description?: string;
}

export interface ExportAssertionRule {
  rule: 'has_export';
  name: string;
  isDefault?: boolean;
  description?: string;
}

export interface ForbiddenSyntaxRule {
  rule: 'no_forbidden_syntax';
  forbidden: ForbiddenSyntaxKind[];
  description?: string;
}

export interface ComplexityAssertionRule {
  rule: 'complexity';
  maxCyclomaticComplexity?: number;
  maxAstDepth?: number;
  description?: string;
}

export interface CustomQueryAssertionRule {
  rule: 'custom_query';
  syntaxKind: string;
  minCount?: number;
  maxCount?: number;
  description?: string;
}

export type ASTAssertionRule =
  | FunctionAssertionRule
  | ClassAssertionRule
  | InterfaceAssertionRule
  | TypeAliasAssertionRule
  | ImportAssertionRule
  | ExportAssertionRule
  | ForbiddenSyntaxRule
  | ComplexityAssertionRule
  | CustomQueryAssertionRule;

export interface ASTAssertion {
  path: string;
  rules: ASTAssertionRule[];
  description?: string;
}

export interface FunctionMetadata {
  name: string;
  isAsync: boolean;
  isGenerator: boolean;
  isExported: boolean;
  params: string[];
  returnType?: string;
  startLine: number;
  cyclomaticComplexity: number;
}

export interface ClassMetadata {
  name: string;
  isExported: boolean;
  isAbstract: boolean;
  extendsClass?: string;
  implementsInterfaces: string[];
  methods: Array<{ name: string; isAsync: boolean; isStatic: boolean }>;
  properties: string[];
  startLine: number;
}

export interface InterfaceMetadata {
  name: string;
  isExported: boolean;
  extendsInterfaces: string[];
  properties: Array<{ name: string; type?: string; optional: boolean }>;
  startLine: number;
}

export interface TypeAliasMetadata {
  name: string;
  isExported: boolean;
  startLine: number;
}

export interface ImportMetadata {
  module: string;
  defaultImport?: string;
  namedImports: string[];
  namespaceImport?: string;
  startLine: number;
}

export interface ExportMetadata {
  name: string;
  isDefault: boolean;
  startLine: number;
}

export interface AntiPatternViolation {
  kind: ForbiddenSyntaxKind;
  message: string;
  line: number;
  column: number;
}

export interface CodeComplexityAnalysis {
  maxDepth: number;
  functions: Record<string, number>;
  maxFunctionComplexity: number;
}
