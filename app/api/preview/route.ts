import { NextResponse } from "next/server";
import sharp from "sharp";
import { detectSensitiveZones, applyBlurRedactions, BoundingBox } from "@/lib/privacy-guard";
import { compositeExchangeCard } from "@/lib/image-processor";
import { getCounter } from "@/lib/counter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const receivedFile = formData.get("received") as File | null;
    const sentFile = formData.get("sent") as File | null;
    const autoBlur = formData.get("autoBlur") !== "false";
    const manualBoxesStr = (formData.get("manualBoxes") as string) || "{}";
    const exchangeNoParam = formData.get("exchangeNo");

    if (!receivedFile || !sentFile) {
      return NextResponse.json(
        { error: "Both received and sent proof screenshots are required." },
        { status: 400 }
      );
    }

    const currentCounter = exchangeNoParam ? Number(exchangeNoParam) : await getCounter();
    const exchangeNo = isNaN(currentCounter) ? 11042 : currentCounter;

    let manualBoxes: { received?: BoundingBox[]; sent?: BoundingBox[] } = {};
    try {
      manualBoxes = JSON.parse(manualBoxesStr);
    } catch {}

    const receivedBuf = Buffer.from(await receivedFile.arrayBuffer());
    const sentBuf = Buffer.from(await sentFile.arrayBuffer());

    const receivedMeta = await sharp(receivedBuf).metadata();
    const sentMeta = await sharp(sentBuf).metadata();

    const recW = receivedMeta.width || 1080;
    const recH = receivedMeta.height || 1920;
    const sentW = sentMeta.width || 1080;
    const sentH = sentMeta.height || 1920;

    let autoBoxesReceived: BoundingBox[] = [];
    let autoBoxesSent: BoundingBox[] = [];

    if (autoBlur) {
      autoBoxesReceived = await detectSensitiveZones(receivedBuf, recW, recH);
      autoBoxesSent = await detectSensitiveZones(sentBuf, sentW, sentH);
    }

    const allReceivedBoxes = [...autoBoxesReceived, ...(manualBoxes.received || [])];
    const allSentBoxes = [...autoBoxesSent, ...(manualBoxes.sent || [])];

    const sanitizedReceived = await applyBlurRedactions(receivedBuf, allReceivedBoxes);
    const sanitizedSent = await applyBlurRedactions(sentBuf, allSentBoxes);

    const compositedBuffer = await compositeExchangeCard({
      receivedImageBuffer: sanitizedReceived,
      sentImageBuffer: sanitizedSent,
      exchangeNo,
    });

    const previewBase64 = `data:image/png;base64,${compositedBuffer.toString("base64")}`;

    return NextResponse.json({
      success: true,
      exchangeNo,
      previewUrl: previewBase64,
      detectedBoxes: {
        received: autoBoxesReceived,
        sent: autoBoxesSent,
      },
    });
  } catch (error: any) {
    console.error("Preview generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate preview" },
      { status: 500 }
    );
  }
}
