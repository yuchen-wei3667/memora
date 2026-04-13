export type SkillId =
  | "fix_failing_tests"
  | "implement_feature_safely"
  | "refactor_preserve_behavior"
  | "generic_implementation";

export interface SkillStepTemplate {
  type: "read" | "edit" | "shell" | "verify";
  description: string;
}

export interface SkillDefinition {
  id: SkillId;
  name: string;
  version: string;
  triggerPatterns: RegExp[];
  requiredInputs: string[];
  stepTemplates: SkillStepTemplate[];
  verificationPolicy: "required" | "optional";
  failureStrategies: string[];
  reflectionPrompts: string[];
}

export interface SkillScoreInput {
  triggerMatch: number;
  historicalSuccess: number;
  repoFit: number;
  recencyBoost: number;
}

export interface SkillScoreBreakdown {
  triggerMatch: number;
  historicalSuccess: number;
  repoFit: number;
  recencyBoost: number;
  final: number;
}

export interface SelectedSkill {
  skill: SkillDefinition;
  score: SkillScoreBreakdown;
  fallbackUsed: boolean;
  reason: string;
}
