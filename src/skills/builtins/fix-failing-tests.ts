import { type SkillDefinition } from "../types.js";

export const fixFailingTestsSkill: SkillDefinition = {
  id: "fix_failing_tests",
  name: "Fix failing tests",
  version: "1.0.0",
  triggerPatterns: [/\bfix\b/i, /\btest(s)?\b/i, /\bfailing\b/i],
  requiredInputs: ["taskText"],
  stepTemplates: [
    {
      type: "read",
      description: "Inspect failing test outputs and relevant files"
    },
    {
      type: "edit",
      description: "Apply minimal code changes to fix test failures"
    },
    { type: "verify", description: "Re-run test verification commands" }
  ],
  verificationPolicy: "required",
  failureStrategies: ["focus-on-first-failure", "reduce-scope"],
  reflectionPrompts: ["Which failure was fixed and why did it work?"]
};
