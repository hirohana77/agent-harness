import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { Trajectory } from '../core/types.js';
import { TrajectorySchema } from '../core/schemas.js';

export class TrajectoryExporter {
  /**
   * Export trajectory to JSON string
   */
  public static toJSON(trajectory: Trajectory, pretty = true): string {
    return JSON.stringify(trajectory, null, pretty ? 2 : undefined);
  }

  /**
   * Export trajectory to YAML string
   */
  public static toYAML(trajectory: Trajectory): string {
    return YAML.stringify(trajectory);
  }

  /**
   * Save trajectory to file (.json or .yaml)
   */
  public static async saveToFile(arg1: string | Trajectory, arg2: string | Trajectory): Promise<string> {
    const filePath = typeof arg1 === "string" ? arg1 : (arg2 as string);
    const trajectory = typeof arg1 === "string" ? (arg2 as Trajectory) : arg1;
    const resolved = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });

    const content = resolved.endsWith('.yaml') || resolved.endsWith('.yml')
      ? this.toYAML(trajectory)
      : this.toJSON(trajectory);

    await fs.writeFile(resolved, content, 'utf8');
    return resolved;
  }

  /**
   * Load and validate trajectory from file
   */
  public static async loadFromFile(filePath: string): Promise<Trajectory> {
    const resolved = path.resolve(filePath);
    const content = await fs.readFile(resolved, 'utf8');

    let parsed: unknown;
    if (resolved.endsWith('.yaml') || resolved.endsWith('.yml')) {
      parsed = YAML.parse(content);
    } else {
      parsed = JSON.parse(content);
    }

    return TrajectorySchema.parse(parsed) as Trajectory;
  }
}
