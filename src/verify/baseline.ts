import {
  diffVerificationFailures,
  type VerificationDiff
} from "./result-diff.js";
import {
  runVerification,
  type VerificationRunResult
} from "./verify-service.js";

export interface BaselineComparisonResult {
  baseline: VerificationRunResult;
  final: VerificationRunResult;
  diff: VerificationDiff;
}

export const runVerificationBaseline = async (input: {
  cwd: string;
  commands: string[];
  timeoutMs?: number;
}): Promise<VerificationRunResult> => {
  return runVerification(input);
};

export const compareVerificationBaseline = async (input: {
  cwd: string;
  commands: string[];
  timeoutMs?: number;
  executeFinal: () => Promise<void>;
}): Promise<BaselineComparisonResult> => {
  const baseline = await runVerificationBaseline(input);
  await input.executeFinal();
  const final = await runVerification({
    cwd: input.cwd,
    commands: input.commands,
    timeoutMs: input.timeoutMs
  });

  return {
    baseline,
    final,
    diff: diffVerificationFailures(baseline.failures, final.failures)
  };
};
