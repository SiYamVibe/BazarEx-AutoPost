import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function verifyAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return true; // No secret configured, open ping allowed

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader === `Bearer ${cronSecret}`) return true;

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || searchParams.get("secret");
  return token === cronSecret;
}

export async function GET(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp: Date.now(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

export async function HEAD(request: Request) {
  if (!verifyAuth(request)) {
    return new NextResponse(null, { status: 401 });
  }
  return new NextResponse(null, { status: 200 });
}
