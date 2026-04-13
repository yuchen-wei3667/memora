import { type VerificationDiff } from "../verify/result-diff.js";

export type RetryStopReason =
  | "max_attempts_reached"
  | "no_progress"
  | "verification_passed";

export interface RetryDecision {
  shouldRetry: boolean;
  reason: RetryStopReason | "actionable_failure";
  nextAttempt: number;
  noProgressCount: number;
}

export interface RetryDecisionInput {
  attempt: number;
  maxAttempts: number;
  noProgressAbort: number;
  diff: VerificationDiff | null;
  verificationPassed: boolean;
  previousNoProgressCount: number;
}

const hasProgress = (diff: VerificationDiff | null): boolean => {
  if (!diff) {
    return false;
  }

  return diff.resolved.length > 0 || diff.introduced.length > 0;
};

export const decideRetry = (input: RetryDecisionInput): RetryDecision => {
  if (input.verificationPassed) {
    return {
      shouldRetry: false,
      reason: "verification_passed",
      nextAttempt: input.attempt,
      noProgressCount: input.previousNoProgressCount
    };
  }

  if (input.attempt >= input.maxAttempts) {
    return {
      shouldRetry: false,
      reason: "max_attempts_reached",
      nextAttempt: input.attempt,
      noProgressCount: input.previousNoProgressCount
    };
  }

  const progressed = hasProgress(input.diff);
  const noProgressCount = progressed ? 0 : input.previousNoProgressCount + 1;

  if (noProgressCount >= input.noProgressAbort) {
    return {
      shouldRetry: false,
      reason: "no_progress",
      nextAttempt: input.attempt,
      noProgressCount
    };
  }

  return {
    shouldRetry: true,
    reason: "actionable_failure",
    nextAttempt: input.attempt + 1,
    noProgressCount
  };
};
