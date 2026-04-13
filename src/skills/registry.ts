import { fixFailingTestsSkill } from "./builtins/fix-failing-tests.js";
import { implementFeatureSafelySkill } from "./builtins/implement-feature-safely.js";
import { refactorPreserveBehaviorSkill } from "./builtins/refactor-preserve-behavior.js";
import { type SkillDefinition } from "./types.js";

const genericImplementationSkill: SkillDefinition = {
  id: "generic_implementation",
  name: "Generic implementation",
  version: "1.0.0",
  triggerPatterns: [],
  requiredInputs: ["taskText"],
  stepTemplates: [
    { type: "read", description: "Inspect relevant context" },
    { type: "edit", description: "Apply requested change" },
    { type: "verify", description: "Run verification commands" }
  ],
  verificationPolicy: "required",
  failureStrategies: ["reduce-change-scope"],
  reflectionPrompts: ["What was the minimal successful change?"]
};

export const builtInSkills: SkillDefinition[] = [
  fixFailingTestsSkill,
  implementFeatureSafelySkill,
  refactorPreserveBehaviorSkill,
  genericImplementationSkill
];

export const listBuiltInSkills = (): SkillDefinition[] => {
  return builtInSkills.map((skill) => ({
    ...skill,
    triggerPatterns: [...skill.triggerPatterns]
  }));
};

export const getSkillById = (
  id: SkillDefinition["id"]
): SkillDefinition | null => {
  return builtInSkills.find((skill) => skill.id === id) ?? null;
};
