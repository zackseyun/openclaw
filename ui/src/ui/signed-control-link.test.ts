import { describe, expect, it } from "vitest";
import { buildSignedControlUiLink } from "./signed-control-link.ts";

describe("buildSignedControlUiLink", () => {
  it("puts the gateway token in a URL fragment and strips unsafe params", () => {
    expect(
      buildSignedControlUiLink({
        href: "http://127.0.0.1:18789/chat?session=main&token=old&password=secret#token=old-hash&foo=bar",
        token: "fresh-token",
      }),
    ).toBe("http://127.0.0.1:18789/chat?session=main#foo=bar&token=fresh-token");
  });

  it("uses the configured public Control UI URL when present", () => {
    expect(
      buildSignedControlUiLink({
        href: "http://127.0.0.1:18789/chat?session=main",
        token: "abc123",
        publicUrl: "https://zack.openclaw.cartha.ai",
      }),
    ).toBe("https://zack.openclaw.cartha.ai/chat?session=main#token=abc123");
  });

  it("preserves public base paths while removing the local base path", () => {
    expect(
      buildSignedControlUiLink({
        href: "http://127.0.0.1:18789/openclaw/chat?session=agent%3Aone%3Amain",
        token: "abc123",
        publicUrl: "https://control.example.com/openclaw",
        basePath: "/openclaw",
      }),
    ).toBe("https://control.example.com/openclaw/chat?session=agent%3Aone%3Amain#token=abc123");
  });

  it("returns null when no token is available", () => {
    expect(buildSignedControlUiLink({ href: "http://127.0.0.1:18789/", token: "" })).toBeNull();
  });

  it("ignores non-http public URLs", () => {
    expect(
      buildSignedControlUiLink({
        href: "http://127.0.0.1:18789/",
        token: "abc123",
        publicUrl: "file:///tmp/openclaw.html",
      }),
    ).toBe("http://127.0.0.1:18789/#token=abc123");
  });
});
