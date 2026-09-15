import { NextResponse } from "next/server";
import { enqueueBotExchange, getJobById, getQueueStatus } from "@/lib/queue";

import crypto from "crypto";

export const dynamic = "force-dynamic";

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "169.254.169.254" // Cloud metadata IP
  ) {
    return true;
  }

  // Private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10)
  if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/.test(host)) {
    return true;
  }

  return false;
}

function isValidUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (isPrivateHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function verifyAuth(request: Request): boolean {
  const expectedKey = process.env.EXTERNAL_BOT_API_KEY?.trim();
  const authHeader = request.headers.get("x-api-key")?.trim();
  if (!expectedKey || !authHeader) return false;

  const a = Buffer.from(authHeader);
  const b = Buffer.from(expectedKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const job = getJobById(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, job });
  }

  return NextResponse.json({
    success: true,
    queue: getQueueStatus(),
  });
}

export async function POST(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON. 'images' array and 'exchangeNo' are required." },
      { status: 400 }
    );
  }

  if (
    !body ||
    !Array.isArray(body.images) ||
    body.images.length !== 2 ||
    !body.images.every(isValidUrl)
  ) {
    return NextResponse.json(
      { error: "Please provide exactly 2 image URLs in the 'images' array." },
      { status: 400 }
    );
  }

  const rawExchangeNo = body.exchangeNo;
  if (
    rawExchangeNo === undefined ||
    rawExchangeNo === null ||
    (typeof rawExchangeNo === "string" && !rawExchangeNo.trim())
  ) {
    return NextResponse.json(
      { error: "'exchangeNo' is required." },
      { status: 400 }
    );
  }
  const exchangeNo = typeof rawExchangeNo === "string" ? rawExchangeNo.trim() : rawExchangeNo;

  try {
    const { job, queuePosition, totalPending } = enqueueBotExchange(body.images, exchangeNo);

    return NextResponse.json(
      {
        success: true,
        status: "queued",
        jobId: job.id,
        exchangeNo,
        queuePosition,
        totalPending,
        message: "Job queued successfully and will be processed sequentially.",
      },
      { status: 202 }
    );
  } catch (error: any) {
    console.error("Bot exchange queue error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error while enqueuing job",
      },
      { status: 500 }
    );
  }
}
