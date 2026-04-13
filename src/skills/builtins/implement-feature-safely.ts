import { type SkillDefinition } from "../types.js";

export const implementFeatureSafelySkill: SkillDefinition = {
  id: "implement_feature_safely",
  name: "Implement feature safely",
  version: "1.0.0",
  triggerPatterns: [/\badd\b/i, /\bimplement\b/i, /\bfeature\b/i],
  requiredInputs: ["taskText"],
  stepTemplates: [
    { type: "read", description: "Inspect target files and nearby patterns" },
    {
      type: "edit",
      description: "Implement feature change with minimal surface area"
    },
    { type: "verify", description: "Run verification commands" }
  ],
  verificationPolicy: "required",
  failureStrategies: ["split-into-smaller-edits"],
  reflectionPrompts: ["Which constraints did this change preserve?"]
};
