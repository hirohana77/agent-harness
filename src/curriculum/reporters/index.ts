import { CurriculumResult } from '../types.js';
import { TerminalCurriculumReporter } from './terminal.js';
import { MarkdownCurriculumReporter } from './markdown.js';
import { JsonCurriculumReporter } from './json.js';

export * from './terminal.js';
export * from './markdown.js';
export * from './json.js';

export type CurriculumReportFormat = 'terminal' | 'markdown' | 'json';

export function renderCurriculumReport(
  result: CurriculumResult,
  format: CurriculumReportFormat = 'terminal'
): string {
  switch (format) {
    case 'markdown':
      return MarkdownCurriculumReporter.render(result);
    case 'json':
      return JsonCurriculumReporter.render(result);
    case 'terminal':
    default:
      return TerminalCurriculumReporter.render(result);
  }
}
