import { describe, expect, it } from "vitest";
import { loadPlates, plateColor, plateHeight } from "./index";

describe("loadPlates", () => {
  it("loads standard pound plates", () => {
    expect(loadPlates(225, "lb")).toEqual({ perSide: [45, 45], loaded: 225, remainder: 0, belowBar: false });
    expect(loadPlates(185, "lb").perSide).toEqual([45, 25]);
    expect(loadPlates(140, "lb").perSide).toEqual([45, 2.5]);
  });

  it("loads kilogram plates including change plates", () => {
    expect(loadPlates(102.5, "kg").perSide).toEqual([25, 15, 1.25]);
    expect(loadPlates(60, "kg").perSide).toEqual([20]);
  });

  it("reports what cannot be loaded exactly", () => {
    const load = loadPlates(137, "lb");
    expect(load.perSide).toEqual([45]);
    expect(load.loaded).toBe(135);
    expect(load.remainder).toBe(2);
  });

  it("handles the empty bar and light targets", () => {
    expect(loadPlates(45, "lb")).toEqual({ perSide: [], loaded: 45, remainder: 0, belowBar: false });
    expect(loadPlates(30, "lb").belowBar).toBe(true);
    expect(loadPlates(0, "lb").perSide).toEqual([]);
    expect(loadPlates(Number.NaN, "kg").perSide).toEqual([]);
  });

  it("respects a custom bar and plate set", () => {
    expect(loadPlates(100, "lb", 35, [25, 10, 5]).perSide).toEqual([25, 5]);
    expect(loadPlates(100, "lb", 35, [25, 10, 5]).remainder).toBe(5);
  });
});

describe("plate drawing", () => {
  it("colors plates like competition plates", () => {
    expect(plateColor(25, "kg")).toBe("#D7263D");
    expect(plateColor(45, "lb")).toBe("#1F6FD1");
    expect(plateColor(15, "kg")).toBe("#F2C230");
  });

  it("draws small plates shorter", () => {
    expect(plateHeight(45, "lb")).toBe(1);
    expect(plateHeight(2.5, "lb")).toBeLessThan(plateHeight(10, "lb"));
  });
});
