import type { ProviderName } from "../config/schema.js";

export interface DeviceCodeConfig {
  flow?: "oauth-device" | "openai-device";
  clientId: string;
  deviceEndpoint: string;
  pollEndpoint?: string;
  tokenEndpoint: string;
  scope: string;
  verificationUri?: string;
  tokenRequestAuthStyle?: "request-body" | "basic-auth";
}

export interface DeviceCodeStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface DeviceCodeTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
}

const toErrorMessage = (status: number, body: unknown): string => {
  if (typeof body === "object" && body !== null && "error_description" in body) {
    return `HTTP ${status}: ${String((body as { error_description?: unknown }).error_description)}`;
  }
  if (typeof body === "object" && body !== null && "error" in body) {
    return `HTTP ${status}: ${String((body as { error?: unknown }).error)}`;
  }
  return `HTTP ${status}: ${JSON.stringify(body)}`;
};

export const requestDeviceCode = async (
  config: DeviceCodeConfig
): Promise<DeviceCodeStartResponse> => {
  if (config.flow === "openai-device") {
    const response = await fetch(config.deviceEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        client_id: config.clientId
      })
    });

    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Device code request failed: ${toErrorMessage(response.status, body)}`);
    }

    return {
      device_code: String(body.device_auth_id ?? ""),
      user_code: String(body.user_code ?? body.usercode ?? ""),
      verification_uri: config.verificationUri ?? "https://auth.openai.com/codex/device",
      expires_in: 900,
      interval: Number(body.interval ?? 5)
    };
  }

  const response = await fetch(config.deviceEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      scope: config.scope
    }).toString()
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Device code request failed: ${toErrorMessage(response.status, body)}`);
  }

  return body as DeviceCodeStartResponse;
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const pollForAccessToken = async (
  provider: ProviderName,
  config: DeviceCodeConfig,
  start: DeviceCodeStartResponse
): Promise<DeviceCodeTokenResponse> => {
  const intervalSeconds = Math.max(1, start.interval ?? 5);
  const timeoutAt = Date.now() + start.expires_in * 1000;
  let intervalMs = intervalSeconds * 1000;

  while (Date.now() < timeoutAt) {
    if (config.flow === "openai-device") {
      if (!config.pollEndpoint) {
        throw new Error("OpenAI device flow requires pollEndpoint.");
      }

      const response = await fetch(config.pollEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          device_auth_id: start.device_code,
          user_code: start.user_code
        })
      });

      const body = (await response.json()) as Record<string, unknown>;
      if (
        response.ok &&
        typeof body.authorization_code === "string" &&
        typeof body.code_verifier === "string"
      ) {
        const exchangeResponse = await fetch(config.tokenEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json"
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: body.authorization_code,
            redirect_uri: "https://auth.openai.com/deviceauth/callback",
            client_id: config.clientId,
            code_verifier: body.code_verifier
          }).toString()
        });

        const exchangeBody = (await exchangeResponse.json()) as Record<string, unknown>;
        if (
          exchangeResponse.ok &&
          typeof exchangeBody.access_token === "string" &&
          typeof exchangeBody.token_type === "string"
        ) {
          return {
            access_token: exchangeBody.access_token,
            token_type: exchangeBody.token_type,
            scope: typeof exchangeBody.scope === "string" ? exchangeBody.scope : undefined
          };
        }

        throw new Error(`${provider} device code exchange failed: ${toErrorMessage(exchangeResponse.status, exchangeBody)}`);
      }

      const status = response.status;
      if (status === 403 || status === 404 || status === 409) {
        await delay(intervalMs);
        continue;
      }

      throw new Error(`${provider} device code token exchange failed: ${toErrorMessage(status, body)}`);
    }

    const tokenPayload = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: start.device_code
    });

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    };

    if (config.tokenRequestAuthStyle === "basic-auth") {
      headers.authorization = `Basic ${Buffer.from(`${config.clientId}:`).toString("base64")}`;
    } else {
      tokenPayload.set("client_id", config.clientId);
    }

    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers,
      body: tokenPayload.toString()
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (
      response.ok &&
      typeof body.access_token === "string" &&
      typeof body.token_type === "string"
    ) {
      return {
        access_token: body.access_token,
        token_type: body.token_type,
        scope: typeof body.scope === "string" ? body.scope : undefined
      };
    }

    const error = typeof body.error === "string" ? body.error : "unknown_error";
    if (error === "authorization_pending") {
      await delay(intervalMs);
      continue;
    }
    if (error === "slow_down") {
      intervalMs += 1000;
      await delay(intervalMs);
      continue;
    }

    throw new Error(`${provider} device code token exchange failed: ${toErrorMessage(response.status, body)}`);
  }

  throw new Error(`${provider} device code login timed out before authorization completed.`);
};
