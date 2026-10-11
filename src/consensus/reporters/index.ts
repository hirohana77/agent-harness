import { ClusterConsensusResult, ConsensusReportFormat } from '../types.js';
import { TerminalConsensusReporter } from './terminal.js';
import { MarkdownConsensusReporter } from './markdown.js';
import { JsonConsensusReporter } from './json.js';

export * from './terminal.js';
export * from './markdown.js';
export * from './json.js';

export function renderConsensusReport(
  result: ClusterConsensusResult,
  format: ConsensusReportFormat = 'terminal'
): string {
  switch (format) {
    case 'markdown':
      return MarkdownConsensusReporter.render(result);
    case 'json':
      return JsonConsensusReporter.render(result);
    case 'terminal':
    default:
      return TerminalConsensusReporter.render(result);
  }
}
