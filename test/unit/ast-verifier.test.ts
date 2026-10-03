import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceManager } from '../../src/sandbox/workspace.js';
import { ASTParser } from '../../src/verifier/ast/parser.js';
import { ASTAnalyzer } from '../../src/verifier/ast/analyzer.js';
import { ASTVerifier } from '../../src/verifier/ast-verifier.js';
import { ASTAssertion } from '../../src/verifier/ast/types.js';

describe('AST Semantic Verification Suite', () => {
  describe('ASTParser', () => {
    beforeEach(() => {
      ASTParser.clearCache();
    });

    it('correctly parses TypeScript and infers script kind', () => {
      const code = 'export const add = (a: number, b: number): number => a + b;';
      const sf = ASTParser.parse('src/math.ts', code);
      expect(sf).toBeDefined();
      expect(sf.fileName).toBe('src/math.ts');
      expect(sf.statements.length).toBeGreaterThan(0);
    });

    it('leverages memory cache for identical code', () => {
      const code = 'function hello() { return "world"; }';
      const sf1 = ASTParser.parse('test.js', code);
      const sf2 = ASTParser.parse('test.js', code);
      expect(sf1).toBe(sf2);

      const sf3 = ASTParser.parse('test.js', code + ' // updated');
      expect(sf3).not.toBe(sf1);
    });
  });

  describe('ASTAnalyzer', () => {
    it('analyzes function declarations, arrow functions, and method signatures', () => {
      const tsCode = `
        import { logger } from './logger';

        export async function fetchUserData(userId: string): Promise<User> {
          return await api.get(userId);
        }

        export const calculateSum = (a: number, b: number) => a + b;

        class OrderService {
          public async processOrder(orderId: string) {
            return true;
          }
        }
      `;

      const sf = ASTParser.parse('service.ts', tsCode);
      const analyzer = new ASTAnalyzer(sf);
      const functions = analyzer.findFunctions();

      expect(functions.length).toBe(3);

      const fetchFn = functions.find((f) => f.name === 'fetchUserData');
      expect(fetchFn).toBeDefined();
      expect(fetchFn?.isAsync).toBe(true);
      expect(fetchFn?.isExported).toBe(true);
      expect(fetchFn?.params).toEqual(['userId']);
      expect(fetchFn?.returnType).toContain('Promise<User>');

      const calcFn = functions.find((f) => f.name === 'calculateSum');
      expect(calcFn).toBeDefined();
      expect(calcFn?.isAsync).toBe(false);
      expect(calcFn?.isExported).toBe(true);
      expect(calcFn?.params).toEqual(['a', 'b']);

      const method = functions.find((f) => f.name === 'processOrder');
      expect(method).toBeDefined();
      expect(method?.isAsync).toBe(true);
    });

    it('analyzes classes, heritage, and member declarations', () => {
      const code = `
        export class RedisCacheService extends BaseCache implements ICacheProvider, IDisposable {
          private client: any;
          public ttl: number;

          public async connect(): Promise<void> {}
          public static getInstance() {}
        }
      `;

      const sf = ASTParser.parse('cache.ts', code);
      const analyzer = new ASTAnalyzer(sf);
      const classes = analyzer.findClasses();

      expect(classes.length).toBe(1);
      const cls = classes[0];
      expect(cls.name).toBe('RedisCacheService');
      expect(cls.isExported).toBe(true);
      expect(cls.extendsClass).toBe('BaseCache');
      expect(cls.implementsInterfaces).toEqual(['ICacheProvider', 'IDisposable']);
      expect(cls.properties).toContain('client');
      expect(cls.properties).toContain('ttl');

      const connectMethod = cls.methods.find((m) => m.name === 'connect');
      expect(connectMethod?.isAsync).toBe(true);
      expect(connectMethod?.isStatic).toBe(false);

      const staticMethod = cls.methods.find((m) => m.name === 'getInstance');
      expect(staticMethod?.isStatic).toBe(true);
    });

    it('analyzes interfaces and type aliases', () => {
      const code = `
        export interface AppConfig extends BaseConfig {
          port: number;
          host?: string;
        }

        export type Handler = (req: Request) => Promise<Response>;
      `;

      const sf = ASTParser.parse('types.ts', code);
      const analyzer = new ASTAnalyzer(sf);

      const interfaces = analyzer.findInterfaces();
      expect(interfaces.length).toBe(1);
      const iface = interfaces[0];
      expect(iface.name).toBe('AppConfig');
      expect(iface.isExported).toBe(true);
      expect(iface.extendsInterfaces).toEqual(['BaseConfig']);
      expect(iface.properties).toEqual([
        { name: 'port', type: 'number', optional: false },
        { name: 'host', type: 'string', optional: true },
      ]);

      const typeAliases = analyzer.findTypeAliases();
      expect(typeAliases.length).toBe(1);
      expect(typeAliases[0].name).toBe('Handler');
      expect(typeAliases[0].isExported).toBe(true);
    });

    it('analyzes import and export contracts', () => {
      const code = `
        import express, { Request, Response } from 'express';
        import * as path from 'node:path';

        const version = '1.0.0';
        export { version };
        export default express;
      `;

      const sf = ASTParser.parse('index.ts', code);
      const analyzer = new ASTAnalyzer(sf);

      const imports = analyzer.findImports();
      expect(imports.length).toBe(2);

      const expressImport = imports.find((i) => i.module === 'express');
      expect(expressImport?.defaultImport).toBe('express');
      expect(expressImport?.namedImports).toEqual(['Request', 'Response']);

      const pathImport = imports.find((i) => i.module === 'node:path');
      expect(pathImport?.namespaceImport).toBe('path');

      const exportsList = analyzer.findExports();
      expect(exportsList.some((e) => e.name === 'version')).toBe(true);
      expect(exportsList.some((e) => e.isDefault)).toBe(true);
    });

    it('detects code anti-patterns accurately', () => {
      const badCode = `
        var legacyCounter = 0;
        function execute(input: any) {
          eval("2 + 2");
          debugger;
          console.log("running");
          try {
            doSomething();
          } catch (e) {}
          const val = input ? (input > 0 ? 1 : -1) : 0;
        }
      `;

      const sf = ASTParser.parse('bad.ts', badCode);
      const analyzer = new ASTAnalyzer(sf);

      const violations = analyzer.detectAntiPatterns([
        'eval',
        'debugger',
        'console',
        'any_type',
        'var_declaration',
        'empty_catch',
        'nested_ternary',
      ]);

      expect(violations.length).toBe(7);
      expect(violations.map((v) => v.kind)).toContain('eval');
      expect(violations.map((v) => v.kind)).toContain('debugger');
      expect(violations.map((v) => v.kind)).toContain('console');
      expect(violations.map((v) => v.kind)).toContain('any_type');
      expect(violations.map((v) => v.kind)).toContain('var_declaration');
      expect(violations.map((v) => v.kind)).toContain('empty_catch');
      expect(violations.map((v) => v.kind)).toContain('nested_ternary');
    });

    it('computes cyclomatic complexity and counts AST node kinds', () => {
      const complexCode = `
        function complexLogic(x: number, y: number) {
          if (x > 0 && y > 0) {
            while (x--) {
              if (x === 5) break;
            }
          } else if (x < 0 || y < 0) {
            for (let i = 0; i < 10; i++) {}
          }
          return x ?? y;
        }
      `;

      const sf = ASTParser.parse('logic.ts', complexCode);
      const analyzer = new ASTAnalyzer(sf);

      const complexity = analyzer.computeComplexity();
      expect(complexity.maxFunctionComplexity).toBeGreaterThanOrEqual(7);
      expect(complexity.maxDepth).toBeGreaterThan(5);

      const ifCount = analyzer.countSyntaxKind('IfStatement');
      expect(ifCount).toBe(3);
    });
  });

  describe('ASTVerifier with WorkspaceManager', () => {
    let ws: WorkspaceManager;
    let verifier: ASTVerifier;

    beforeEach(async () => {
      ws = new WorkspaceManager();
      await ws.setup({
        initialFiles: {
          'src/calculator.ts': `
            export interface ICalculator {
              add(a: number, b: number): number;
            }

            export class Calculator implements ICalculator {
              public add(a: number, b: number): number {
                return a + b;
              }
            }

            export async function computeTotal(items: number[]): Promise<number> {
              return items.reduce((sum, item) => sum + item, 0);
            }
          `,
          'src/unsafe.js': `
            var secret = 42;
            function dangerous() {
              eval("secret = 100");
              console.log("changed secret");
            }
          `,
        },
      });
      verifier = new ASTVerifier(ws);
    });

    afterEach(async () => {
      await ws.teardown();
    });

    it('passes verification when code meets AST rules', async () => {
      const assertion: ASTAssertion = {
        path: 'src/calculator.ts',
        rules: [
          {
            rule: 'has_interface',
            name: 'ICalculator',
            isExported: true,
            properties: [{ name: 'add' }],
          },
          {
            rule: 'has_class',
            name: 'Calculator',
            isExported: true,
            implementsInterfaces: ['ICalculator'],
            methods: [{ name: 'add', isAsync: false }],
          },
          {
            rule: 'has_function',
            name: 'computeTotal',
            isAsync: true,
            isExported: true,
            minParams: 1,
            maxParams: 1,
            paramNames: ['items'],
            returnType: 'Promise<number>',
          },
          {
            rule: 'no_forbidden_syntax',
            forbidden: ['eval', 'debugger', 'console', 'var_declaration'],
          },
          {
            rule: 'complexity',
            maxCyclomaticComplexity: 5,
            maxAstDepth: 20,
          },
        ],
      };

      const results = await verifier.verify([assertion]);
      expect(results.length).toBe(5);
      expect(results.every((r) => r.passed)).toBe(true);
      for (const r of results) {
        expect(r.type).toBe('ast');
      }
    });

    it('catches missing functions, bad parameters, and anti-patterns', async () => {
      const assertions: ASTAssertion[] = [
        {
          path: 'src/calculator.ts',
          rules: [
            {
              rule: 'has_function',
              name: 'nonExistentFunction',
            },
            {
              rule: 'has_function',
              name: 'computeTotal',
              minParams: 5, // will fail
            },
          ],
        },
        {
          path: 'src/unsafe.js',
          rules: [
            {
              rule: 'no_forbidden_syntax',
              forbidden: ['eval', 'var_declaration', 'console'],
            },
          ],
        },
      ];

      const results = await verifier.verify(assertions);
      expect(results.length).toBe(3);
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain('nonExistentFunction');
      expect(results[1].passed).toBe(false);
      expect(results[1].message).toContain('expected at least 5');
      expect(results[2].passed).toBe(false);
      expect(results[2].message).toContain('Detected 3 forbidden syntax violation(s)');
    });

    it('gracefully handles missing target files', async () => {
      const assertion: ASTAssertion = {
        path: 'src/does-not-exist.ts',
        rules: [{ rule: 'has_function', name: 'foo' }],
      };

      const results = await verifier.verify([assertion]);
      expect(results.length).toBe(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain('does not exist');
    });
  });
});
