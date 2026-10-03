import { z } from 'zod';

export const ForbiddenSyntaxKindSchema = z.enum([
  'eval',
  'debugger',
  'console',
  'any_type',
  'var_declaration',
  'empty_catch',
  'nested_ternary',
]);

export const MethodSignatureExpectationSchema = z.object({
  name: z.string().min(1),
  isAsync: z.boolean().optional(),
  isStatic: z.boolean().optional(),
});

export const PropertySignatureExpectationSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  optional: z.boolean().optional(),
});

export const FunctionAssertionRuleSchema = z.object({
  rule: z.literal('has_function'),
  name: z.string().min(1),
  isAsync: z.boolean().optional(),
  isGenerator: z.boolean().optional(),
  isExported: z.boolean().optional(),
  minParams: z.number().int().nonnegative().optional(),
  maxParams: z.number().int().nonnegative().optional(),
  paramNames: z.array(z.string()).optional(),
  returnType: z.string().optional(),
  description: z.string().optional(),
});

export const ClassAssertionRuleSchema = z.object({
  rule: z.literal('has_class'),
  name: z.string().min(1),
  isExported: z.boolean().optional(),
  isAbstract: z.boolean().optional(),
  extendsClass: z.string().optional(),
  implementsInterfaces: z.array(z.string()).optional(),
  methods: z.array(MethodSignatureExpectationSchema).optional(),
  properties: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const InterfaceAssertionRuleSchema = z.object({
  rule: z.literal('has_interface'),
  name: z.string().min(1),
  isExported: z.boolean().optional(),
  extendsInterfaces: z.array(z.string()).optional(),
  properties: z.array(PropertySignatureExpectationSchema).optional(),
  description: z.string().optional(),
});

export const TypeAliasAssertionRuleSchema = z.object({
  rule: z.literal('has_type_alias'),
  name: z.string().min(1),
  isExported: z.boolean().optional(),
  description: z.string().optional(),
});

export const ImportAssertionRuleSchema = z.object({
  rule: z.literal('has_import'),
  module: z.string().min(1),
  defaultImport: z.string().optional(),
  namedImports: z.array(z.string()).optional(),
  namespaceImport: z.string().optional(),
  description: z.string().optional(),
});

export const ExportAssertionRuleSchema = z.object({
  rule: z.literal('has_export'),
  name: z.string().min(1),
  isDefault: z.boolean().optional(),
  description: z.string().optional(),
});

export const ForbiddenSyntaxRuleSchema = z.object({
  rule: z.literal('no_forbidden_syntax'),
  forbidden: z.array(ForbiddenSyntaxKindSchema).min(1),
  description: z.string().optional(),
});

export const ComplexityAssertionRuleSchema = z.object({
  rule: z.literal('complexity'),
  maxCyclomaticComplexity: z.number().int().positive().optional(),
  maxAstDepth: z.number().int().positive().optional(),
  description: z.string().optional(),
});

export const CustomQueryAssertionRuleSchema = z.object({
  rule: z.literal('custom_query'),
  syntaxKind: z.string().min(1),
  minCount: z.number().int().nonnegative().optional(),
  maxCount: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
});

export const ASTAssertionRuleSchema = z.discriminatedUnion('rule', [
  FunctionAssertionRuleSchema,
  ClassAssertionRuleSchema,
  InterfaceAssertionRuleSchema,
  TypeAliasAssertionRuleSchema,
  ImportAssertionRuleSchema,
  ExportAssertionRuleSchema,
  ForbiddenSyntaxRuleSchema,
  ComplexityAssertionRuleSchema,
  CustomQueryAssertionRuleSchema,
]);

export const ASTAssertionSchema = z.object({
  path: z.string().min(1),
  rules: z.array(ASTAssertionRuleSchema).min(1),
  description: z.string().optional(),
});
