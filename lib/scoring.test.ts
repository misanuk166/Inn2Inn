import { describe, it, expect } from "vitest";
import {
  categorize,
  totalScore,
  scoreNaturalness,
  scoreElevation,
  scoreWater,
  scoreSurface,
  scoreDistance,
  lineLengthMiles,
  SCENIC_THRESHOLDS,
} from "./scoring";

describe("categorize", () => {
  it("maps boundary values per spec", () => {
    expect(categorize(0)).toBe("urban_road");
    expect(categorize(31)).toBe("urban_road");
    expect(categorize(SCENIC_THRESHOLDS.MODERATE)).toBe("moderately_scenic");
    expect(categorize(51)).toBe("moderately_scenic");
    expect(categorize(SCENIC_THRESHOLDS.SCENIC)).toBe("scenic");
    expect(categorize(71)).toBe("scenic");
    expect(categorize(SCENIC_THRESHOLDS.HIGHLY)).toBe("highly_scenic");
    expect(categorize(100)).toBe("highly_scenic");
  });
});

describe("totalScore", () => {
  it("clamps each sub-score to 0..20 then sums", () => {
    expect(
      totalScore({
        naturalness: 25, // clamped to 20
        elevation: -5,   // clamped to 0
        water: 10,
        surface: 15,
        distance: 20,
      })
    ).toBe(65);
  });
});

describe("sub-scores: edge cases", () => {
  it("naturalness: all-natural and no roads → 20; all-road → 0", () => {
    expect(scoreNaturalness({ fractionInNatural: 1, fractionOnMajorRoad: 0 })).toBe(20);
    expect(scoreNaturalness({ fractionInNatural: 0, fractionOnMajorRoad: 1 })).toBe(0);
  });

  it("elevation: zero-elevation route scores 0; 4000ft scores ~20", () => {
    expect(scoreElevation({ gainFt: 0, lossFt: 0 })).toBe(0);
    expect(scoreElevation({ gainFt: 2000, lossFt: 2000 })).toBeCloseTo(20, 0);
  });

  it("water: maxes at fraction=1", () => {
    expect(scoreWater({ fractionNearWater: 0 })).toBe(0);
    expect(scoreWater({ fractionNearWater: 1 })).toBe(20);
  });

  it("surface: all-trail = 20; all-major-road = 0; all-minor = 10", () => {
    expect(
      scoreSurface({ fractionTrail: 1, fractionMinor: 0, fractionMajor: 0 })
    ).toBe(20);
    expect(
      scoreSurface({ fractionTrail: 0, fractionMinor: 0, fractionMajor: 1 })
    ).toBe(0);
    expect(
      scoreSurface({ fractionTrail: 0, fractionMinor: 1, fractionMajor: 0 })
    ).toBe(10);
  });

  it("distance: peaked at 7 mi, near-zero below 1 mi and above 14 mi", () => {
    const peak = scoreDistance({ distanceMi: 7 });
    expect(peak).toBeCloseTo(20, 0);
    expect(scoreDistance({ distanceMi: 0 })).toBe(0);
    expect(scoreDistance({ distanceMi: 1 })).toBeLessThan(scoreDistance({ distanceMi: 4 }));
    expect(scoreDistance({ distanceMi: 14 })).toBeLessThan(scoreDistance({ distanceMi: 9 }));
  });
});

describe("lineLengthMiles", () => {
  it("computes haversine length of a simple polyline", () => {
    // ~1 deg lat ≈ 69 mi
    const line = {
      type: "LineString" as const,
      coordinates: [
        [-122.5, 37.0],
        [-122.5, 38.0],
      ],
    };
    expect(lineLengthMiles(line)).toBeGreaterThan(68);
    expect(lineLengthMiles(line)).toBeLessThan(70);
  });
});
