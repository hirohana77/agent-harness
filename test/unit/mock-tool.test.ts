import { describe, it, expect } from "vitest";
import { MockToolRegistry } from "../../src/mock/registry.js";

describe("MockToolRegistry", () => {
  it("registers tools and handles exact argument matching", async () => {
    const registry = new MockToolRegistry();
    registry.registerTool({ name: "weather_api" });

    registry
      .expect("weather_api")
      .withArgs({ city: "Tokyo" })
      .thenReturn({ success: true, output: "Sunny, 22C" })
      .times(1);

    const res = await registry.dispatch("weather_api", { city: "Tokyo" });
    expect(res.success).toBe(true);
    expect(res.output).toBe("Sunny, 22C");

    const assertions = registry.verifyAll();
    expect(assertions).toHaveLength(1);
    expect(assertions[0].passed).toBe(true);
  });

  it("fails verification when expected call count is not met", async () => {
    const registry = new MockToolRegistry();
    registry
      .expect("database_query")
      .withArgs({ table: "users" })
      .thenReturn("[]")
      .times(2);

    await registry.dispatch("database_query", { table: "users" });

    const assertions = registry.verifyAll();
    expect(assertions[0].passed).toBe(false);
    expect(assertions[0].message).toContain("expected 2 calls, but got 1");
  });

  it("supports dynamic computation handlers", async () => {
    const registry = new MockToolRegistry();
    registry
      .expect("calc")
      .thenCompute((args) => ({
        success: true,
        output: String(Number(args.a) + Number(args.b)),
      }));

    const res = await registry.dispatch("calc", { a: 10, b: 32 });
    expect(res.output).toBe("42");
  });
});
