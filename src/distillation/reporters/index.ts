import { DistilledPolicy, DistillationReportFormat } from '../types.js';
import { TerminalDistillationReporter } from './terminal.js';
import { MarkdownDistillationReporter } from './markdown.js';
import { PromptGuidanceFormatter } from '../formatters.js';

export * from './terminal.js';
export * from './markdown.js';

export function renderDistillationReport(
  policy: DistilledPolicy,
  format: DistillationReportFormat = 'terminal'
): string {
  switch (format) {
    case 'terminal':
      return TerminalDistillationReporter.render(policy);
    case 'markdown':
      return MarkdownDistillationReporter.render(policy);
    case 'json':
      return JSON.stringify(policy, null, 2);
    case 'fewshot':
      return JSON.stringify(PromptGuidanceFormatter.formatAsOpenAI(policy), null, 2);
    case 'steering':
      return JSON.stringify(PromptGuidanceFormatter.formatAsSteeringConfig(policy), null, 2);
    default:
      return TerminalDistillationReporter.render(policy);
  }
}
