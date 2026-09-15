import { NextResponse } from "next/server";
import sharp from "sharp";
import { classifyTwoScreenshots, generateDefaultCaption } from "@/lib/receipt-classifier";
import { detectSensitiveZones, applyBlurRedactions } from "@/lib/privacy-guard";
import { compositeExchangeCard } from "@/lib/image-processor";

import { getNextPostSlot } from "@/lib/scheduler";

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

export async function POST(request: Request) {
  const expectedKey = process.env.EXTERNAL_BOT_API_KEY?.trim();
  const authHeader = request.headers.get("x-api-key")?.trim();

  if (!expectedKey || !authHeader || authHeader !== expectedKey) {
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
    const images = body.images as string[];

    // Ingest images purely in-memory
    const buffers = await Promise.all(
      images.map(async (url) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`Failed to fetch image from ${url} (HTTP ${res.status})`);
        return Buffer.from(await res.arrayBuffer());
      })
    );

    // 1. Classify "WE RECEIVED" vs "WE SENT" & 2. Detect Currencies
    const classification = await classifyTwoScreenshots(buffers[0], buffers[1]);
    const receivedBuf = buffers[classification.receivedIndex];
    const sentBuf = buffers[classification.sentIndex];

    // 3. Privacy Guard
    const [recMeta, sentMeta] = await Promise.all([
      sharp(receivedBuf).metadata(),
      sharp(sentBuf).metadata(),
    ]);

    const [boxesReceived, boxesSent] = await Promise.all([
      detectSensitiveZones(receivedBuf, recMeta.width || 1080, recMeta.height || 1920),
      detectSensitiveZones(sentBuf, sentMeta.width || 1080, sentMeta.height || 1920),
    ]);

    const [sanitizedReceived, sanitizedSent] = await Promise.all([
      applyBlurRedactions(receivedBuf, boxesReceived),
      applyBlurRedactions(sentBuf, boxesSent),
    ]);

    // 4. Composite onto template using client-provided exchangeNo
    const finalizedBuffer = await compositeExchangeCard({
      receivedImageBuffer: sanitizedReceived,
      sentImageBuffer: sanitizedSent,
      exchangeNo,
    });

    // 5. Generate standardized caption
    const caption = generateDefaultCaption(
      exchangeNo,
      classification.fromCurrency.label,
      classification.toCurrency.label
    );

    // 6. Schedule / Post to Meta Graph API
    const pageId = process.env.FB_PAGE_ID?.trim();
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN?.trim();
    const isMock = !pageId || !accessToken || pageId === "your_facebook_page_id_here";

    const scheduleSlot = await getNextPostSlot();
    let postUrl = "";

    if (isMock) {
      const mockPostId = `108${Math.floor(Math.random() * 900000000 + 100000000)}`;
      postUrl = `https://facebook.com/${mockPostId}`;
    } else {
      const metaFormData = new FormData();
      const imageBlob = new Blob([new Uint8Array(finalizedBuffer)], { type: "image/png" });
      metaFormData.append("source", imageBlob, `exchange_${exchangeNo}.png`);
      metaFormData.append("message", caption);

      if (scheduleSlot.isScheduled && scheduleSlot.unixTimestamp) {
        metaFormData.append("published", "false");
        metaFormData.append("scheduled_publish_time", scheduleSlot.unixTimestamp.toString());
      } else {
        metaFormData.append("published", "true");
      }

      const fbUrl = `https://graph.facebook.com/v19.0/${pageId}/photos?access_token=${encodeURIComponent(accessToken)}`;
      const fbRes = await fetch(fbUrl, {
        method: "POST",
        body: metaFormData,
        signal: AbortSignal.timeout(30000),
      });

      const responseText = await fbRes.text();
      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { error: { message: responseText } };
      }

      if (!fbRes.ok) {
        throw new Error(parsed.error?.message || `Meta API request failed with status ${fbRes.status}`);
      }

      postUrl = parsed.permalink_url || (parsed.id ? `https://facebook.com/${parsed.id}` : "");
    }

    return NextResponse.json({
      success: true,
      exchangeNo,
      postUrl,
      schedule: scheduleSlot,
    });
  } catch (error: any) {
    console.error("Bot exchange endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
