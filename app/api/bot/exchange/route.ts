import { NextResponse } from "next/server";
import { enqueueBotExchange, getJobById, getQueueStatus } from "@/lib/queue";

export const dynamic = "force-dynamic";

function isValidUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function verifyAuth(request: Request): boolean {
  const expectedKey = process.env.EXTERNAL_BOT_API_KEY?.trim();
  const authHeader = request.headers.get("x-api-key")?.trim();
  return Boolean(expectedKey && authHeader && authHeader === expectedKey);
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
