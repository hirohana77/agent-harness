import chalk from 'chalk';
import { TrajectoryEvent, TrajectoryStreamObserver } from '../types.js';

export interface LiveConsoleObserverOptions {
  verbose?: boolean;
  showTimestamp?: boolean;
  logger?: (msg: string) => void;
}

export class LiveConsoleObserver implements TrajectoryStreamObserver {
  public readonly name = 'LiveConsoleObserver';
  private verbose: boolean;
  private showTimestamp: boolean;
  private log: (msg: string) => void;

  constructor(options?: LiveConsoleObserverOptions) {
    this.verbose = options?.verbose ?? false;
    this.showTimestamp = options?.showTimestamp ?? true;
    this.log = options?.logger ?? console.log;
  }

  public onEvent(event: TrajectoryEvent): void {
    const timePrefix = this.showTimestamp
      ? chalk.gray(`[${new Date(event.timestamp).toLocaleTimeString()}] `)
      : '';

    switch (event.type) {
      case 'scenario:start':
        this.log(`${timePrefix}${chalk.blue.bold('▶ [SCENARIO START]')} ${chalk.cyan(event.scenarioName || event.scenarioId)}`);
        break;

      case 'turn:start':
        this.log(
          `${timePrefix}${chalk.cyan.bold(`[TURN #${event.turnNumber}]`)} ${chalk.white(event.prompt.slice(0, 100))}${
            event.prompt.length > 100 ? '...' : ''
          }`
        );
        if (event.thought && this.verbose) {
          this.log(`${timePrefix}  ${chalk.italic.gray(`Thought: ${event.thought}`)}`);
        }
        break;

      case 'tool:start':
        if (this.verbose) {
          this.log(
            `${timePrefix}  ${chalk.yellow(`⚙ [TOOL START]`)} ${chalk.bold(event.toolName)} (${event.callId})`
          );
        }
        break;

      case 'tool:end': {
        const statusIcon = event.result?.success !== false ? chalk.green('✔') : chalk.red('✘');
        const durationStr = chalk.gray(`(${event.durationMs}ms)`);
        this.log(
          `${timePrefix}  ${statusIcon} ${chalk.yellow.bold(`[TOOL]`)} ${chalk.bold(event.toolName)} ${durationStr}`
        );
        if (this.verbose && event.result?.output) {
          const preview = event.result.output.trim().split('\n')[0];
          this.log(`${timePrefix}    ${chalk.gray(`Output: ${preview.slice(0, 80)}`)}`);
        }
        break;
      }

      case 'turn:complete': {
        const tokenBadge = event.tokensUsed
          ? chalk.gray(`[tokens: +${event.tokensUsed.totalTokens} | cum: ${event.cumulativeTokens}]`)
          : '';
        this.log(
          `${timePrefix}${chalk.magenta.bold(`🏁 [TURN #${event.turnNumber} COMPLETE]`)} ${tokenBadge}`
        );
        break;
      }

      case 'budget:warning':
        this.log(`${timePrefix}${chalk.yellow.bold('⚠️ [BUDGET WARNING]')} ${chalk.yellow(event.message)}`);
        break;

      case 'status:change':
        this.log(
          `${timePrefix}${chalk.blue('🔄 [STATUS]')} ${chalk.gray(event.previousStatus)} -> ${chalk.bold(
            event.newStatus
          )} ${event.reason ? chalk.gray(`(${event.reason})`) : ''}`
        );
        break;

      case 'scenario:complete': {
        const outcome = event.passed ? chalk.green.bold('PASSED') : chalk.red.bold('FAILED');
        this.log(
          `${timePrefix}${chalk.bold('◼ [SCENARIO FINISHED]')} status: ${chalk.bold(
            event.status
          )} | outcome: ${outcome} | duration: ${chalk.gray(`${event.durationMs}ms`)}`
        );
        break;
      }

      case 'error':
        this.log(
          `${timePrefix}${chalk.red.bold('✘ [ERROR]')} [phase: ${event.phase}] ${chalk.red(
            event.errorMessage
          )}`
        );
        break;

      case 'custom':
        if (this.verbose) {
          this.log(
            `${timePrefix}${chalk.gray(`[CUSTOM:${event.eventName}]`)} ${JSON.stringify(event.payload)}`
          );
        }
        break;
    }
  }

  public async flush(): Promise<void> {}
}
