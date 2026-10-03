import ts from 'typescript';
import path from 'node:path';

export interface ASTParseOptions {
  scriptKind?: ts.ScriptKind;
  target?: ts.ScriptTarget;
}

export class ASTParser {
  private static cache = new Map<string, { hash: string; sourceFile: ts.SourceFile }>();

  /**
   * Determine TypeScript ScriptKind based on file extension
   */
  public static getScriptKindFromPath(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.mts':
      case '.cts':
        return ts.ScriptKind.TS;
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.jsx':
        return ts.ScriptKind.JSX;
      case '.js':
      case '.mjs':
      case '.cjs':
        return ts.ScriptKind.JS;
      case '.json':
        return ts.ScriptKind.JSON;
      default:
        return ts.ScriptKind.TS;
    }
  }

  /**
   * Parse source code string into a TypeScript SourceFile AST.
   */
  public static parse(filePath: string, code: string, options?: ASTParseOptions): ts.SourceFile {
    const scriptKind = options?.scriptKind ?? this.getScriptKindFromPath(filePath);
    const target = options?.target ?? ts.ScriptTarget.Latest;

    // Fast memory cache check
    const cacheKey = `${filePath}:${scriptKind}:${target}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.hash === code) {
      return cached.sourceFile;
    }

    const sourceFile = ts.createSourceFile(filePath, code, target, true, scriptKind);

    // Keep cache bounded
    if (this.cache.size > 200) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, { hash: code, sourceFile });

    return sourceFile;
  }

  /**
   * Clear parser AST cache
   */
  public static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Extract parse/syntax diagnostic messages
   */
  public static getParseDiagnostics(sourceFile: ts.SourceFile): string[] {
    const diagnostics: string[] = [];
    // Note: ts.parseDiagnostics or syntactic errors in sourceFile
    if ((sourceFile as any).parseDiagnostics && Array.isArray((sourceFile as any).parseDiagnostics)) {
      for (const diag of (sourceFile as any).parseDiagnostics) {
        diagnostics.push(typeof diag.messageText === 'string' ? diag.messageText : diag.messageText.messageText);
      }
    }
    return diagnostics;
  }
}
