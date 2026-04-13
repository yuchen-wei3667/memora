import { type RunTrace } from "../trace/trace-writer.js";

export interface ExtractedLearning {
  memories: Array<{
    category: string;
    content: string;
    score: number;
    confidence: number;
  }>;
  failureSignatures: string[];
  retryStopReason: string | null;
}

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

export const extractLearningFromTrace = (
  trace: RunTrace
): ExtractedLearning => {
  const runCompleted = [...trace.events]
    .reverse()
    .find((event) => event.eventType === "run.completed");
  const retryDecision = [...trace.events]
    .reverse()
    .find((event) => event.eventType === "retry.decided");
  const verificationEvents = trace.events.filter(
    (event) => event.eventType === "verification.completed"
  );

  const success =
    (runCompleted?.payload.success as boolean | undefined) === true;
  const summary =
    typeof runCompleted?.payload.summary === "string"
      ? runCompleted.payload.summary
      : "";

  const memories =
    success && summary.length > 0
      ? [
          {
            category: "learning",
            content: summary,
            score: 0.75,
            confidence: 0.7
          }
        ]
      : [];

  const failureSignatures = verificationEvents.flatMap((event) =>
    asStringArray(event.payload.failureSignatures)
  );

  return {
    memories,
    failureSignatures,
    retryStopReason:
      typeof retryDecision?.payload.reason === "string"
        ? retryDecision.payload.reason
        : null
  };
};
