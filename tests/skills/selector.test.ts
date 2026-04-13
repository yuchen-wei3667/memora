import { describe, expect, it } from "vitest";

import { selectSkill, computeSkillScore } from "../../src/skills/selector.js";

describe("skill selector", () => {
  it("computes weighted skill score", () => {
    const score = computeSkillScore({
      triggerMatch: 1,
      historicalSuccess: 0.5,
      repoFit: 0.5,
      recencyBoost: 0.5
    });

    expect(score.final).toBeCloseTo(0.7, 5);
  });

  it("selects different skills for different prompts", () => {
    const fixSelection = selectSkill({
      taskText: "fix failing tests for parser",
      repoSignals: ["npm test", "typescript"]
    });
    const featureSelection = selectSkill({
      taskText: "implement feature for onboarding",
      repoSignals: ["npm test", "typescript"]
    });

    expect(fixSelection.skill.id).toBe("fix_failing_tests");
    expect(featureSelection.skill.id).toBe("implement_feature_safely");
  });

  it("falls back to generic skill when threshold is not met", () => {
    const selection = selectSkill({
      taskText: "misc request",
      repoSignals: [],
      historicalSuccessBySkill: {
        fix_failing_tests: 0,
        implement_feature_safely: 0,
        refactor_preserve_behavior: 0,
        generic_implementation: 0
      },
      recencyBoostBySkill: {
        fix_failing_tests: 0,
        implement_feature_safely: 0,
        refactor_preserve_behavior: 0,
        generic_implementation: 0
      },
      threshold: 0.95
    });

    expect(selection.skill.id).toBe("generic_implementation");
    expect(selection.fallbackUsed).toBe(true);
  });
});
