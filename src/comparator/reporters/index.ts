import { TrajectoryDiff } from '../types.js';
import { TerminalDiffReporter } from './terminal.js';
import { MarkdownDiffReporter } from './markdown.js';
import { HtmlDiffReporter } from './html.js';
import { JsonDiffReporter } from './json.js';

export * from './terminal.js';
export * from './markdown.js';
export * from './html.js';
export * from './json.js';

export type DiffReportFormat = 'terminal' | 'markdown' | 'html' | 'json';

export function renderTrajectoryDiff(diff: TrajectoryDiff, format: DiffReportFormat = 'terminal'): string {
  switch (format) {
    case 'terminal':
      return TerminalDiffReporter.render(diff);
    case 'markdown':
      return MarkdownDiffReporter.render(diff);
    case 'html':
      return HtmlDiffReporter.render(diff);
    case 'json':
      return JsonDiffReporter.render(diff);
    default:
      return TerminalDiffReporter.render(diff);
  }
}
