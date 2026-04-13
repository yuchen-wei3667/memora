import { Command } from "commander";

import { listBuiltInSkills } from "../../skills/registry.js";

export const createSkillsCommand = (): Command => {
  const skills = new Command("skills").description("List available skills");

  skills
    .command("list")
    .description("List built-in and repo-specific skills")
    .action(() => {
      const builtins = listBuiltInSkills();
      for (const skill of builtins) {
        console.log(`${skill.id} | ${skill.name} | v${skill.version}`);
      }
    });

  return skills;
};
