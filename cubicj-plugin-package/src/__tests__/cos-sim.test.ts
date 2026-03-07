import { describe, it, expect } from "vitest";
import { cosSim } from "../embedding/cos-sim";

describe("cosSim", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosSim([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("returns 0 when either vector is zero", () => {
    expect(cosSim([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosSim([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosSim([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("computes known similarity correctly", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const dot = 1 * 4 + 2 * 5 + 3 * 6;
    const magA = Math.sqrt(1 + 4 + 9);
    const magB = Math.sqrt(16 + 25 + 36);
    expect(cosSim(a, b)).toBeCloseTo(dot / (magA * magB));
  });
});
