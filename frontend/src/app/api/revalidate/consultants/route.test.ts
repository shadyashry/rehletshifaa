import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag }));

import { POST } from "./route";

function request(secret: string, body: unknown) {
  return new NextRequest("http://localhost/api/revalidate/consultants", {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidate-secret": secret },
    body: JSON.stringify(body),
  });
}

describe("Consultant directory revalidation", () => {
  beforeEach(() => {
    vi.stubEnv("REVALIDATE_SECRET", "shared-test-secret");
    revalidateTag.mockReset();
  });

  it("rejects a wrong shared secret without invalidating anything", async () => {
    const response = await POST(request("wrong", { slug: "amira-hassan" }));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("invalidates only the fixed directory and validated Consultant tags", async () => {
    const response = await POST(request("shared-test-secret", { slug: "amira-hassan", tags: ["anything"] }));
    expect(response.status).toBe(204);
    expect(revalidateTag).toHaveBeenNthCalledWith(1, "consultants", { expire: 0 });
    expect(revalidateTag).toHaveBeenNthCalledWith(2, "consultant:amira-hassan", { expire: 0 });
  });

  it("does not turn caller input into an arbitrary cache tag", async () => {
    const response = await POST(request("shared-test-secret", { slug: "../../admin" }));
    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
