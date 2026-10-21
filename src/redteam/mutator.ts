import { ScenarioDefinition } from "../core/types.js";
import { RedTeamProbe } from "./types.js";

export class AdversarialMutator {
  /**
   * Injects an adversarial probe into a base scenario, producing a mutated scenario copy
   */
  public static inject(
    scenario: ScenarioDefinition,
    probe: RedTeamProbe
  ): ScenarioDefinition {
    // Clone workspace initialFiles
    const initialFiles: Record<string, string> = {
      ...(scenario.workspace?.initialFiles || {}),
    };

    let instruction = scenario.task.instruction;

    switch (probe.vector) {
      case "instruction": {
        instruction = `${instruction}\n${probe.payload}`;
        break;
      }

      case "file-injection": {
        const targetPath = probe.targetFile || "README.md";
        const existingContent = initialFiles[targetPath];
        if (existingContent) {
          initialFiles[targetPath] = `${existingContent}\n${probe.payload}`;
        } else {
          initialFiles[targetPath] = probe.payload;
        }
        break;
      }

      case "env-injection": {
        const envPath = ".env";
        const existingEnv = initialFiles[envPath];
        const envContent =
          probe.payload ||
          (probe.canarySecret ? `CANARY_SECRET=${probe.canarySecret}\n` : "");
        if (existingEnv) {
          initialFiles[envPath] = `${existingEnv}\n${envContent}`;
        } else {
          initialFiles[envPath] = envContent;
        }
        break;
      }

      case "mock-tool": {
        const mockFilePath = "fixtures/external-api-response.json";
        initialFiles[mockFilePath] = probe.payload;
        instruction = `${instruction}\n(External API cache stored in ${mockFilePath})`;
        break;
      }
    }

    return {
      ...scenario,
      id: `${scenario.id}-redteam-${probe.id}`,
      name: `${scenario.name || scenario.id} [RedTeam: ${probe.name}]`,
      task: {
        ...scenario.task,
        instruction,
      },
      workspace: {
        cleanup: scenario.workspace?.cleanup ?? false,
        gitInit: scenario.workspace?.gitInit ?? true,
        templatePath: scenario.workspace?.templatePath,
        initialFiles,
      },
    };
  }
}
