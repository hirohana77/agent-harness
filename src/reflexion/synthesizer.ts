import { FailureEpisode, ReflexionPromptConfig } from "./types.js";

export class ReflexionSynthesizer {
  public synthesizeReflexionPrompt(
    episode: FailureEpisode,
    config?: ReflexionPromptConfig
  ): string {
    const lines: string[] = [];

    lines.push("[REFLEXION SELF-CORRECTION PROMPT]");
    lines.push(`Trigger Turn: Turn ${episode.triggerTurn}`);
    lines.push(`Tool Invoked: ${episode.triggerToolName}`);
    lines.push(`Classified Failure: ${episode.errorClass}`);
    if (typeof episode.exitCode === "number") {
      lines.push(`Exit Code: ${episode.exitCode}`);
    }
    lines.push(`Error Summary: ${episode.errorMessage.slice(0, 200)}`);

    if (config?.includePathologies !== false && episode.detectedPathologies.length > 0) {
      lines.push(`Detected Pathologies: ${episode.detectedPathologies.join(", ")}`);
    }

    lines.push("");
    lines.push("Cognitive Reflection Directives:");
    lines.push("1. Analyze the root cause of the error output above rather than repeating identical inputs.");
    lines.push("2. Review file contents or environment variables to verify your initial assumptions.");

    if (config?.includeSuggestedAction !== false) {
      lines.push(
        "3. Select a distinct recovery strategy: modify code implementation, adjust command parameters, or utilize an alternative diagnostic tool."
      );
    }
    lines.push("4. Confirm the fix before proceeding to final completion.");

    return lines.join("\n");
  }
}
