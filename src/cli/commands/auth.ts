import { Command } from "commander";

import { loadConfig } from "../../config/loader.js";
import { DEFAULT_CONFIG } from "../../config/schema.js";
import { assertSupportedProvider } from "../../providers/registry.js";
import { clearAuthToken, getAuthStatus, upsertAuthToken } from "../../auth/store.js";
import { pollForAccessToken, requestDeviceCode } from "../../auth/device-code.js";

const resolveLoginToken = async (
  provider: "openai-codex" | "github-copilot",
  options: {
    token?: string;
    apiKey?: string;
    fromEnv?: boolean;
    deviceCode?: boolean;
    memoraHome?: string;
  }
): Promise<{ token: string; authType: "api-key" | "token" }> => {
  if (options.deviceCode) {
    const loaded = await loadConfig({ memoraHome: options.memoraHome, createIfMissing: true });
    const deviceConfig = loaded.config.providers[provider].deviceCode;
    const fallbackDeviceConfig = DEFAULT_CONFIG.providers[provider].deviceCode;
    const flow = deviceConfig.flow ?? fallbackDeviceConfig.flow;
    const hasExplicitFlow = Boolean(deviceConfig.flow);

    const effectiveDeviceConfig = {
      flow,
      clientId:
        deviceConfig.clientId ??
        fallbackDeviceConfig.clientId ??
        (deviceConfig.clientIdEnv ? process.env[deviceConfig.clientIdEnv] : undefined) ??
        (fallbackDeviceConfig.clientIdEnv ? process.env[fallbackDeviceConfig.clientIdEnv] : undefined),
      // If older config does not define flow, we treat it as legacy and prefer known-good defaults.
      deviceEndpoint: hasExplicitFlow
        ? deviceConfig.deviceEndpoint
        : fallbackDeviceConfig.deviceEndpoint,
      pollEndpoint: hasExplicitFlow ? deviceConfig.pollEndpoint : fallbackDeviceConfig.pollEndpoint,
      tokenEndpoint: hasExplicitFlow ? deviceConfig.tokenEndpoint : fallbackDeviceConfig.tokenEndpoint,
      scope: hasExplicitFlow ? deviceConfig.scope : fallbackDeviceConfig.scope,
      verificationUri: hasExplicitFlow
        ? deviceConfig.verificationUri
        : fallbackDeviceConfig.verificationUri
    };
    const clientId = effectiveDeviceConfig.clientId;

    if (!clientId) {
      throw new Error(`Device code client ID is not configured for ${provider}.`);
    }

    const start = await requestDeviceCode({
      flow,
      clientId,
      deviceEndpoint: effectiveDeviceConfig.deviceEndpoint,
      pollEndpoint: effectiveDeviceConfig.pollEndpoint,
      tokenEndpoint: effectiveDeviceConfig.tokenEndpoint,
      scope: effectiveDeviceConfig.scope,
      verificationUri: effectiveDeviceConfig.verificationUri
    });

    const verificationUrl = start.verification_uri_complete ?? start.verification_uri;
    console.log(`Open this URL and complete sign-in: ${verificationUrl}`);
    console.log(`If prompted, enter code: ${start.user_code}`);

    const tokenResponse = await pollForAccessToken(
      provider,
      {
        clientId,
        flow,
        deviceEndpoint: effectiveDeviceConfig.deviceEndpoint,
        pollEndpoint: effectiveDeviceConfig.pollEndpoint,
        tokenEndpoint: effectiveDeviceConfig.tokenEndpoint,
        scope: effectiveDeviceConfig.scope,
        verificationUri: effectiveDeviceConfig.verificationUri,
        tokenRequestAuthStyle: provider === "github-copilot" ? "basic-auth" : "request-body"
      },
      start
    );

    return { token: tokenResponse.access_token, authType: "token" };
  }

  const directToken = provider === "openai-codex" ? options.apiKey ?? options.token : options.token;
  if (directToken) {
    return {
      token: directToken,
      authType: provider === "openai-codex" ? "api-key" : "token"
    };
  }

  const config = await loadConfig({ memoraHome: options.memoraHome, createIfMissing: true });

  if (provider === "openai-codex") {
    const apiKeyEnv = config.config.providers["openai-codex"].apiKeyEnv;
    const fromEnv = process.env[apiKeyEnv];

    if (fromEnv) {
      return { token: fromEnv, authType: "api-key" };
    }

    throw new Error(
      `No OpenAI API key provided. Use --api-key, --token, or set ${apiKeyEnv} in your environment.`
    );
  }

  const copilotToken = process.env.GITHUB_COPILOT_TOKEN;
  if (copilotToken) {
    return { token: copilotToken, authType: "token" };
  }

  if (options.fromEnv) {
    throw new Error("GITHUB_COPILOT_TOKEN is not set.");
  }

  throw new Error(
    "No GitHub Copilot token provided. Use --token or set GITHUB_COPILOT_TOKEN in your environment."
  );
};

export const createAuthCommand = (): Command => {
  const auth = new Command("auth").description("Manage provider authentication");

  auth
    .command("login")
    .description("Login to a provider")
    .argument("<provider>", "Provider name (openai-codex|github-copilot)")
    .option("--token <token>", "Provider token")
    .option("--api-key <apiKey>", "OpenAI API key (openai-codex only)")
    .option("--from-env", "Load credentials from environment variables")
    .option("--device-code", "Use device code authentication flow")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .action(
      async (
        providerInput: string,
        options: {
          token?: string;
          apiKey?: string;
          fromEnv?: boolean;
          deviceCode?: boolean;
          memoraHome?: string;
        }
      ) => {
        const provider = assertSupportedProvider(providerInput);
        const { token, authType } = await resolveLoginToken(provider, options);
        const result = await upsertAuthToken(provider, token, authType, options.memoraHome);

        console.log(`Logged in to ${provider}. Credentials saved to ${result.authPath}.`);
      }
    );

  auth
    .command("status")
    .description("Show login status for providers")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .action(async (options: { memoraHome?: string }) => {
      const status = await getAuthStatus(options.memoraHome);

      for (const provider of ["openai-codex", "github-copilot"] as const) {
        const providerStatus = status[provider];
        const line = providerStatus.loggedIn
          ? `${provider}: logged in (${providerStatus.authType}, updated ${providerStatus.updatedAt})`
          : `${provider}: logged out`;
        console.log(line);
      }
    });

  auth
    .command("logout")
    .description("Logout from a provider")
    .argument("<provider>", "Provider name (openai-codex|github-copilot)")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .action(async (providerInput: string, options: { memoraHome?: string }) => {
      const provider = assertSupportedProvider(providerInput);
      const result = await clearAuthToken(provider, options.memoraHome);
      console.log(`Logged out from ${provider}. Updated ${result.authPath}.`);
    });

  return auth;
};
