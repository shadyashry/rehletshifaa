import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function authorised(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

export async function POST(request: NextRequest) {
  if (!authorised(request.headers.get("x-revalidate-secret"), process.env.REVALIDATE_SECRET)) {
    return new NextResponse(null, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { slug?: unknown } | null;
  if (!body || typeof body.slug !== "string" || !SLUG.test(body.slug) || body.slug.length > 80) {
    return NextResponse.json({ code: "INVALID_CONSULTANT_SLUG" }, { status: 400 });
  }

  // Next 16 requires an explicit profile. expire: 0 gives the required immediate expiry; the 15-minute fetch TTL
  // remains the safety net if a delivery is delayed.
  revalidateTag("consultants", { expire: 0 });
  revalidateTag(`consultant:${body.slug}`, { expire: 0 });
  return new NextResponse(null, { status: 204 });
}
