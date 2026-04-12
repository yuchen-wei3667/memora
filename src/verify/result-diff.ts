export interface FailureSignature {
  command: string;
  filePath?: string;
  testName?: string;
  message: string;
  fingerprint: string;
  signature: string;
}

export interface ClassifiedFailure {
  classification: "pre-existing" | "introduced" | "resolved";
  failure: FailureSignature;
}

export interface VerificationDiff {
  preExisting: FailureSignature[];
  introduced: FailureSignature[];
  resolved: FailureSignature[];
  classified: ClassifiedFailure[];
}

const bySignature = (
  failures: FailureSignature[]
): Map<string, FailureSignature> => {
  return new Map(failures.map((failure) => [failure.signature, failure]));
};

export const diffVerificationFailures = (
  baseline: FailureSignature[],
  final: FailureSignature[]
): VerificationDiff => {
  const baselineMap = bySignature(baseline);
  const finalMap = bySignature(final);

  const preExisting = final.filter((failure) =>
    baselineMap.has(failure.signature)
  );
  const introduced = final.filter(
    (failure) => !baselineMap.has(failure.signature)
  );
  const resolved = baseline.filter(
    (failure) => !finalMap.has(failure.signature)
  );

  return {
    preExisting,
    introduced,
    resolved,
    classified: [
      ...preExisting.map((failure) => ({
        classification: "pre-existing" as const,
        failure
      })),
      ...introduced.map((failure) => ({
        classification: "introduced" as const,
        failure
      })),
      ...resolved.map((failure) => ({
        classification: "resolved" as const,
        failure
      }))
    ]
  };
};
