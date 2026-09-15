import { NextResponse } from "next/server";
import { getCounter, setCounter } from "@/lib/counter";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function verifyAuth(request: Request): boolean {
  const expectedKey = process.env.EXTERNAL_BOT_API_KEY?.trim();
  const authHeader = request.headers.get("x-api-key")?.trim();
  if (!expectedKey || !authHeader) return false;

  const a = Buffer.from(authHeader);
  const b = Buffer.from(expectedKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET() {
  try {
    const exchangeNo = await getCounter();
    return NextResponse.json({ exchangeNo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to read counter" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const val = Number(body.exchangeNo);
    if (isNaN(val) || val < 0) {
      return NextResponse.json({ error: "Invalid exchange number" }, { status: 400 });
    }
    const updated = await setCounter(val);
    return NextResponse.json({ exchangeNo: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update counter" }, { status: 500 });
  }
}
