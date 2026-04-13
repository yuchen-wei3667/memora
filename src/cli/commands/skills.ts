import { Command } from "commander";

import { loadConfig, resolveMemoraHome } from "../../config/loader.js";
import { closeDatabase, openDatabase } from "../../storage/db.js";
import { runMigrations } from "../../storage/migrations/run-migrations.js";
import { listBuiltInSkills } from "../../skills/registry.js";

export const createSkillsCommand = (): Command => {
  const skills = new Command("skills").description("List available skills");

  skills
    .command("list")
    .description("List built-in and repo-specific skills")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .action(async (options: { memoraHome?: string }) => {
      const builtins = listBuiltInSkills();
      const memoraHome = resolveMemoraHome(options.memoraHome);
      await loadConfig({ memoraHome, createIfMissing: true });
      await runMigrations({ memoraHome });
      const db = openDatabase({ memoraHome });
      const metricRows = db
        .prepare(
          `SELECT skill_id, success_count, failure_count FROM skills WHERE repo_id IS NULL`
        )
        .all() as Array<{
        skill_id: string;
        success_count: number;
        failure_count: number;
      }>;
      closeDatabase(db);
      const metricsBySkill = new Map(
        metricRows.map((row) => [row.skill_id, row] as const)
      );

      for (const skill of builtins) {
        const metrics = metricsBySkill.get(skill.id);
        const success = metrics?.success_count ?? 0;
        const failure = metrics?.failure_count ?? 0;
        console.log(
          `${skill.id} | ${skill.name} | v${skill.version} | success=${success} | failure=${failure}`
        );
      }
    });

  return skills;
};
