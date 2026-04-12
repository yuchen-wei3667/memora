import { describe, expect, it, vi } from "vitest";

import { pollForAccessToken, requestDeviceCode } from "../../src/auth/device-code.js";

describe("device code auth flow", () => {
  it("requests device code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        device_code: "dev-code",
        user_code: "user-code",
        verification_uri: "https://example.com/device",
        expires_in: 600,
        interval: 1
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestDeviceCode({
      flow: "oauth-device",
      clientId: "client-id",
      deviceEndpoint: "https://example.com/device/code",
      tokenEndpoint: "https://example.com/token",
      scope: "openid"
    });

    expect(response.device_code).toBe("dev-code");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("polls until access token is returned", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "authorization_pending" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "token-123", token_type: "Bearer" })
      });
    vi.stubGlobal("fetch", fetchMock);

    const token = await pollForAccessToken(
      "github-copilot",
      {
        flow: "oauth-device",
        clientId: "client-id",
        deviceEndpoint: "https://example.com/device/code",
        tokenEndpoint: "https://example.com/token",
        scope: "read:user"
      },
      {
        device_code: "dev",
        user_code: "user",
        verification_uri: "https://example.com/verify",
        expires_in: 60,
        interval: 0
      }
    );

    expect(token.access_token).toBe("token-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses basic auth style for token polling when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "token-123", token_type: "Bearer" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await pollForAccessToken(
      "github-copilot",
      {
        flow: "oauth-device",
        clientId: "client-id",
        deviceEndpoint: "https://example.com/device/code",
        tokenEndpoint: "https://example.com/token",
        scope: "read:user",
        tokenRequestAuthStyle: "basic-auth"
      },
      {
        device_code: "dev",
        user_code: "user",
        verification_uri: "https://example.com/verify",
        expires_in: 60,
        interval: 0
      }
    );

    const request = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string>; body?: string };
    expect(request.headers?.authorization?.startsWith("Basic ")).toBe(true);
    expect(String(request.body)).not.toContain("client_id=");
  });

  it("supports OpenAI-specific device code flow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          device_auth_id: "device-auth-id",
          user_code: "code-1234",
          interval: "0"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authorization_code: "auth-code",
          code_verifier: "verifier",
          code_challenge: "challenge"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "openai-token",
          token_type: "Bearer"
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    const start = await requestDeviceCode({
      flow: "openai-device",
      clientId: "app-id",
      deviceEndpoint: "https://auth.openai.com/api/accounts/deviceauth/usercode",
      pollEndpoint: "https://auth.openai.com/api/accounts/deviceauth/token",
      tokenEndpoint: "https://auth.openai.com/oauth/token",
      scope: "openid profile offline_access",
      verificationUri: "https://auth.openai.com/codex/device"
    });

    const token = await pollForAccessToken(
      "openai-codex",
      {
        flow: "openai-device",
        clientId: "app-id",
        deviceEndpoint: "https://auth.openai.com/api/accounts/deviceauth/usercode",
        pollEndpoint: "https://auth.openai.com/api/accounts/deviceauth/token",
        tokenEndpoint: "https://auth.openai.com/oauth/token",
        scope: "openid profile offline_access",
        verificationUri: "https://auth.openai.com/codex/device"
      },
      start
    );

    expect(token.access_token).toBe("openai-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
