import {
  readPackageJson,
  type PackageJsonLike
} from "./framework-detectors.js";

const commandForScript = (
  packageManager: string,
  scriptName: string
): string => {
  switch (packageManager) {
    case "pnpm":
      return `pnpm ${scriptName}`;
    case "yarn":
      return scriptName === "test" ? "yarn test" : `yarn ${scriptName}`;
    case "bun":
      return scriptName === "test" ? "bun test" : `bun run ${scriptName}`;
    case "npm":
    default:
      return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
  }
};

const collectVerificationScripts = (
  packageJson: PackageJsonLike | null
): string[] => {
  const scriptEntries = packageJson?.scripts ?? {};
  const preferredOrder = ["test", "lint", "typecheck", "check", "build"];

  return preferredOrder.filter(
    (name) => typeof scriptEntries[name] === "string"
  );
};

export const discoverVerificationCommands = async (
  repoRoot: string,
  packageManager: string
): Promise<string[]> => {
  const packageJson = await readPackageJson(repoRoot);
  const scripts = collectVerificationScripts(packageJson);

  return scripts.map((scriptName) =>
    commandForScript(packageManager, scriptName)
  );
};
