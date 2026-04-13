import { type SkillDefinition } from "../types.js";

export const refactorPreserveBehaviorSkill: SkillDefinition = {
  id: "refactor_preserve_behavior",
  name: "Refactor preserve behavior",
  version: "1.0.0",
  triggerPatterns: [/\brefactor\b/i, /\bclean\s*up\b/i, /\brestructure\b/i],
  requiredInputs: ["taskText"],
  stepTemplates: [
    {
      type: "read",
      description: "Inspect current implementation and constraints"
    },
    { type: "edit", description: "Refactor while preserving behavior" },
    { type: "verify", description: "Run verification commands" }
  ],
  verificationPolicy: "required",
  failureStrategies: ["narrow-refactor-scope"],
  reflectionPrompts: ["How was behavior preserved during refactor?"]
};
