import { describe, expect, it } from "vitest";
import type { User } from "oidc-client-ts";
import { userRoles } from "@/lib/auth-client";

function token(payload: object) {
  const encoded = btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `header.${encoded}.signature`;
}

describe("userRoles", () => {
  it("merges roles from the ID-token profile and access token", () => {
    const user = {
      profile: { realm_access: { roles: ["PATIENT"] } },
      access_token: token({ realm_access: { roles: ["PATIENT", "COORDINATOR"] }, roles: ["AUDITOR"] }),
    } as unknown as User;

    expect(userRoles(user)).toEqual(["PATIENT", "COORDINATOR", "AUDITOR"]);
  });

  it("ignores malformed access tokens", () => {
    expect(userRoles({ profile: {}, access_token: "invalid" } as unknown as User)).toEqual([]);
  });
});
