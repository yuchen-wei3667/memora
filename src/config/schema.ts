import { z } from "zod";

export const configSchemaVersion = 1;

export const providerNames = ["openai-codex", "github-copilot"] as const;

export const providerNameSchema = z.enum(providerNames);

export type ProviderName = z.infer<typeof providerNameSchema>;

export const openAICodexProviderSchema = z
  .object({
    apiKeyEnv: z.string().min(1),
    model: z.string().min(1),
    deviceCode: z
      .object({
        flow: z.enum(["oauth-device", "openai-device"]).optional(),
        clientId: z.string().min(1).optional(),
        clientIdEnv: z.string().min(1).optional(),
        deviceEndpoint: z.string().url(),
        pollEndpoint: z.string().url().optional(),
        tokenEndpoint: z.string().url(),
        scope: z.string().min(1),
        verificationUri: z.string().url().optional()
      })
      .strict()
  })
  .strict();

export const githubCopilotProviderSchema = z
  .object({
    authMode: z.literal("device-flow"),
    model: z.string().min(1),
    deviceCode: z
      .object({
        flow: z.enum(["oauth-device", "openai-device"]).optional(),
        clientId: z.string().min(1).optional(),
        clientIdEnv: z.string().min(1).optional(),
        deviceEndpoint: z.string().url(),
        pollEndpoint: z.string().url().optional(),
        tokenEndpoint: z.string().url(),
        scope: z.string().min(1),
        verificationUri: z.string().url().optional()
      })
      .strict()
  })
  .strict();

export const memoraConfigSchema = z
  .object({
    defaultProvider: providerNameSchema,
    providers: z
      .object({
        "openai-codex": openAICodexProviderSchema,
        "github-copilot": githubCopilotProviderSchema
      })
      .strict(),
    retry: z
      .object({
        maxAttempts: z.number().int().min(1).max(20),
        noProgressAbort: z.number().int().min(1).max(20)
      })
      .strict(),
    verification: z
      .object({
        runBaselineBeforeEdit: z.boolean(),
        defaultTimeoutSec: z.number().int().min(1)
      })
      .strict(),
    safety: z
      .object({
        allowNetworkInGeneratedTools: z.boolean(),
        requireToolApproval: z.boolean()
      })
      .strict()
  })
  .strict();

export type MemoraConfig = z.infer<typeof memoraConfigSchema>;

export const DEFAULT_CONFIG: MemoraConfig = {
  defaultProvider: "openai-codex",
  providers: {
    "openai-codex": {
      apiKeyEnv: "OPENAI_API_KEY",
      model: "gpt-5-codex",
      deviceCode: {
        flow: "openai-device",
        clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
        deviceEndpoint: "https://auth.openai.com/api/accounts/deviceauth/usercode",
        pollEndpoint: "https://auth.openai.com/api/accounts/deviceauth/token",
        tokenEndpoint: "https://auth.openai.com/oauth/token",
        scope: "openid profile offline_access",
        verificationUri: "https://auth.openai.com/codex/device"
      }
    },
    "github-copilot": {
      authMode: "device-flow",
      model: "gpt-5-codex",
      deviceCode: {
        flow: "oauth-device",
        clientId: "178c6fc778ccc68e1d6a",
        deviceEndpoint: "https://github.com/login/device/code",
        tokenEndpoint: "https://github.com/login/oauth/access_token",
        scope: "read:user"
      }
    }
  },
  retry: {
    maxAttempts: 3,
    noProgressAbort: 2
  },
  verification: {
    runBaselineBeforeEdit: true,
    defaultTimeoutSec: 900
  },
  safety: {
    allowNetworkInGeneratedTools: false,
    requireToolApproval: false
  }
};

export const parseMemoraConfig = (value: unknown): MemoraConfig => {
  return memoraConfigSchema.parse(value);
};

export const isSupportedProvider = (value: string): value is ProviderName => {
  return providerNames.includes(value as ProviderName);
};
