import { listBuiltInSkills } from "./registry.js";
import {
  type SkillDefinition,
  type SkillScoreBreakdown,
  type SkillScoreInput,
  type SelectedSkill
} from "./types.js";

export const computeSkillScore = (
  input: SkillScoreInput
): SkillScoreBreakdown => {
  const clamped = {
    triggerMatch: Math.max(0, Math.min(1, input.triggerMatch)),
    historicalSuccess: Math.max(0, Math.min(1, input.historicalSuccess)),
    repoFit: Math.max(0, Math.min(1, input.repoFit)),
    recencyBoost: Math.max(0, Math.min(1, input.recencyBoost))
  };

  return {
    ...clamped,
    final:
      clamped.triggerMatch * 0.4 +
      clamped.historicalSuccess * 0.3 +
      clamped.repoFit * 0.2 +
      clamped.recencyBoost * 0.1
  };
};

const triggerMatchForTask = (
  skill: SkillDefinition,
  taskText: string
): number => {
  if (skill.id === "generic_implementation") {
    return 0;
  }

  const matches = skill.triggerPatterns.filter((pattern) =>
    pattern.test(taskText)
  ).length;
  if (skill.triggerPatterns.length === 0) {
    return 0;
  }
  return matches / skill.triggerPatterns.length;
};

const repoFit = (skill: SkillDefinition, repoSignals: string[]): number => {
  if (repoSignals.length === 0) {
    return 0.5;
  }

  const signalText = repoSignals.join(" ").toLowerCase();
  if (skill.id === "fix_failing_tests" && signalText.includes("test")) {
    return 0.8;
  }
  if (
    skill.id === "implement_feature_safely" &&
    signalText.includes("typescript")
  ) {
    return 0.7;
  }
  if (
    skill.id === "refactor_preserve_behavior" &&
    signalText.includes("lint")
  ) {
    return 0.7;
  }
  return 0.6;
};

export const selectSkill = (input: {
  taskText: string;
  repoSignals: string[];
  historicalSuccessBySkill?: Partial<Record<SkillDefinition["id"], number>>;
  recencyBoostBySkill?: Partial<Record<SkillDefinition["id"], number>>;
  threshold?: number;
}): SelectedSkill => {
  const skills = listBuiltInSkills();
  const threshold = input.threshold ?? 0.45;

  const scored = skills.map((skill) => {
    const breakdown = computeSkillScore({
      triggerMatch: triggerMatchForTask(skill, input.taskText),
      historicalSuccess: input.historicalSuccessBySkill?.[skill.id] ?? 0.5,
      repoFit: repoFit(skill, input.repoSignals),
      recencyBoost: input.recencyBoostBySkill?.[skill.id] ?? 0.5
    });

    return {
      skill,
      score: breakdown
    };
  });

  scored.sort((left, right) => {
    if (right.score.final !== left.score.final) {
      return right.score.final - left.score.final;
    }

    return left.skill.id.localeCompare(right.skill.id);
  });

  const best = scored[0];
  if (best.score.final >= threshold) {
    return {
      skill: best.skill,
      score: best.score,
      fallbackUsed: false,
      reason: "best score above threshold"
    };
  }

  const fallback = skills.find(
    (skill) => skill.id === "generic_implementation"
  )!;
  return {
    skill: fallback,
    score: computeSkillScore({
      triggerMatch: triggerMatchForTask(fallback, input.taskText),
      historicalSuccess: input.historicalSuccessBySkill?.[fallback.id] ?? 0.5,
      repoFit: repoFit(fallback, input.repoSignals),
      recencyBoost: input.recencyBoostBySkill?.[fallback.id] ?? 0.5
    }),
    fallbackUsed: true,
    reason: "no skill met threshold"
  };
};
