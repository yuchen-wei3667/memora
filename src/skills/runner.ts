import { type PlannedStep } from "../runtime/planner.js";

import { type SkillDefinition } from "./types.js";

export const renderSkillSteps = (skill: SkillDefinition): PlannedStep[] => {
  return skill.stepTemplates.map((template) => ({
    type: template.type,
    description: template.description
  }));
};

export interface SkillRunMetadata {
  skillId: SkillDefinition["id"];
  skillName: string;
  version: string;
  verificationPolicy: SkillDefinition["verificationPolicy"];
}

export const createSkillRunMetadata = (
  skill: SkillDefinition
): SkillRunMetadata => {
  return {
    skillId: skill.id,
    skillName: skill.name,
    version: skill.version,
    verificationPolicy: skill.verificationPolicy
  };
};
