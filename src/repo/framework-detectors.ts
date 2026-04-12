import { access, readFile } from "node:fs/promises";
import path from "node:path";

export interface PackageJsonLike {
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface DetectedRepoProfile {
  language: string;
  framework: string;
  packageManager: string;
}

const hasFile = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readPackageJson = async (
  repoRoot: string
): Promise<PackageJsonLike | null> => {
  const packageJsonPath = path.join(repoRoot, "package.json");

  try {
    const raw = await readFile(packageJsonPath, "utf8");
    return JSON.parse(raw) as PackageJsonLike;
  } catch (error: unknown) {
    const isMissing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT";

    if (isMissing) {
      return null;
    }

    throw error;
  }
};

const detectPackageManagerFromPackageJson = (
  packageJson: PackageJsonLike | null
): string | null => {
  if (!packageJson?.packageManager) {
    return null;
  }

  const [name] = packageJson.packageManager.split("@");
  return name || null;
};

export const detectPackageManager = async (
  repoRoot: string,
  packageJson: PackageJsonLike | null
): Promise<string> => {
  const fromPackageJson = detectPackageManagerFromPackageJson(packageJson);
  if (fromPackageJson) {
    return fromPackageJson;
  }

  const lockfiles: Array<{ name: string; packageManager: string }> = [
    { name: "pnpm-lock.yaml", packageManager: "pnpm" },
    { name: "yarn.lock", packageManager: "yarn" },
    { name: "bun.lockb", packageManager: "bun" },
    { name: "bun.lock", packageManager: "bun" },
    { name: "package-lock.json", packageManager: "npm" }
  ];

  for (const lockfile of lockfiles) {
    if (await hasFile(path.join(repoRoot, lockfile.name))) {
      return lockfile.packageManager;
    }
  }

  if (packageJson) {
    return "npm";
  }

  return "unknown";
};

export const detectLanguage = async (
  repoRoot: string,
  packageJson: PackageJsonLike | null
): Promise<string> => {
  if (await hasFile(path.join(repoRoot, "tsconfig.json"))) {
    return "typescript";
  }

  const dependencies = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies
  };

  if (typeof dependencies.typescript === "string") {
    return "typescript";
  }

  if (packageJson) {
    return "javascript";
  }

  return "unknown";
};

export const detectFramework = (
  packageJson: PackageJsonLike | null
): string => {
  if (packageJson) {
    return "node";
  }

  return "unknown";
};

export const detectRepoProfile = async (
  repoRoot: string
): Promise<DetectedRepoProfile> => {
  const packageJson = await readPackageJson(repoRoot);

  return {
    language: await detectLanguage(repoRoot, packageJson),
    framework: detectFramework(packageJson),
    packageManager: await detectPackageManager(repoRoot, packageJson)
  };
};
