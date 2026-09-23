import fs from "node:fs/promises";
import path from "node:path";
import { HarnessReport } from "../core/types.js";

export class JsonReporter {
  public static format(report: HarnessReport, pretty = true): string {
    return JSON.stringify(report, null, pretty ? 2 : undefined);
  }

  public static async save(report: HarnessReport, outputPath: string): Promise<void> {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, this.format(report, true), "utf8");
  }
}
