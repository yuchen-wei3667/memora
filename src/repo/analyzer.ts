import {
  detectRepoProfile,
  type DetectedRepoProfile
} from "./framework-detectors.js";
import { discoverVerificationCommands } from "./verification-discovery.js";

export interface RepoAnalysis {
  detected: DetectedRepoProfile;
  verificationCommands: string[];
}

export const analyzeRepo = async (repoRoot: string): Promise<RepoAnalysis> => {
  const detected = await detectRepoProfile(repoRoot);
  const verificationCommands = await discoverVerificationCommands(
    repoRoot,
    detected.packageManager
  );

  return {
    detected,
    verificationCommands
  };
};
