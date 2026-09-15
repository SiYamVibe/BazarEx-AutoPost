import { NextResponse } from "next/server";
import sharp from "sharp";
import { detectSensitiveZones, applyBlurRedactions, BoundingBox } from "@/lib/privacy-guard";
import { compositeExchangeCard } from "@/lib/image-processor";
import { getCounter, incrementCounter } from "@/lib/counter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const receivedFile = formData.get("received") as File | null;
    const sentFile = formData.get("sent") as File | null;
    const caption = formData.get("caption") as string | null;
    const autoBlur = formData.get("autoBlur") !== "false";
    const manualBoxesStr = (formData.get("manualBoxes") as string) || "{}";
    const dryRun = formData.get("dryRun") === "true";

    if (!receivedFile || !sentFile) {
      return NextResponse.json(
        { error: "Both received and sent proof screenshots are required." },
        { status: 400 }
      );
    }

    if (!caption || !caption.trim()) {
      return NextResponse.json({ error: "Caption cannot be empty." }, { status: 400 });
    }

    let manualBoxes: { received?: BoundingBox[]; sent?: BoundingBox[] } = {};
    try {
      manualBoxes = JSON.parse(manualBoxesStr);
    } catch {}

    const exchangeNo = await getCounter();

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
      const [boxesR, boxesS] = await Promise.all([
        detectSensitiveZones(receivedBuf, recW, recH),
        detectSensitiveZones(sentBuf, sentW, sentH),
      ]);
      autoBoxesReceived = boxesR;
      autoBoxesSent = boxesS;
    }

    const allReceivedBoxes = [...autoBoxesReceived, ...(manualBoxes.received || [])];
    const allSentBoxes = [...autoBoxesSent, ...(manualBoxes.sent || [])];

    // Sanitize images
    const [sanitizedReceived, sanitizedSent] = await Promise.all([
      applyBlurRedactions(receivedBuf, allReceivedBoxes),
      applyBlurRedactions(sentBuf, allSentBoxes),
    ]);

    // Composite final 1080x1080 image
    const finalizedBuffer = await compositeExchangeCard({
      receivedImageBuffer: sanitizedReceived,
      sentImageBuffer: sanitizedSent,
      exchangeNo,
    });

    const pageId = process.env.FB_PAGE_ID?.trim();
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN?.trim();

    // Check credentials or dryRun mode
    const isMock = dryRun || !pageId || !accessToken || pageId === "your_facebook_page_id_here";

    let fbResponseData: any = null;

    if (isMock) {
      // Simulated publishing
      const mockPostId = `108${Math.floor(Math.random() * 900000000 + 100000000)}`;
      fbResponseData = {
        id: mockPostId,
        post_id: `${pageId || "10000000000000"}_${mockPostId}`,
        permalink_url: `https://facebook.com/${mockPostId}`,
        simulated: true,
      };
    } else {
      // Call Meta Graph API
      const metaFormData = new FormData();
      const imageBlob = new Blob([new Uint8Array(finalizedBuffer)], { type: "image/png" });
      metaFormData.append("source", imageBlob, `exchange_${exchangeNo}.png`);
      metaFormData.append("message", caption);
      metaFormData.append("published", "true");

      const fbUrl = `https://graph.facebook.com/v19.0/${pageId}/photos?access_token=${encodeURIComponent(accessToken)}`;

      const fbRes = await fetch(fbUrl, {
        method: "POST",
        body: metaFormData,
      });

      const responseText = await fbRes.text();
      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { error: { message: responseText } };
      }

      if (!fbRes.ok) {
        const errorMsg = parsed.error?.message || "Failed to publish photo to Facebook Page";
        const errorType = parsed.error?.type || "GraphMethodException";
        const errorCode = parsed.error?.code || fbRes.status;

        let userAdvice = errorMsg;
        if (errorCode === 190) {
          userAdvice = "Facebook Access Token has expired or is invalid. Please refresh FB_PAGE_ACCESS_TOKEN.";
        } else if (errorCode === 200 || errorCode === 283) {
          userAdvice = "Permission denied: Ensure the token has 'pages_manage_posts' and 'pages_read_engagement' permissions.";
        } else if (errorCode === 4 || errorCode === 17) {
          userAdvice = "Rate limit reached on Facebook Graph API. Please wait a few minutes.";
        }

        return NextResponse.json(
          {
            error: userAdvice,
            rawError: parsed.error,
          },
          { status: 502 }
        );
      }

      fbResponseData = parsed;
      // If Meta returns id, construct permalink or fetch permalink
      if (fbResponseData.id && !fbResponseData.permalink_url) {
        fbResponseData.permalink_url = `https://facebook.com/${fbResponseData.id}`;
      }
    }

    // Atomically increment counter ONLY after successful response
    const newCounter = await incrementCounter();

    return NextResponse.json({
      success: true,
      publishedExchangeNo: exchangeNo,
      nextExchangeNo: newCounter,
      post: fbResponseData,
      previewUrl: `data:image/png;base64,${finalizedBuffer.toString("base64")}`,
    });
  } catch (error: any) {
    console.error("Exchange publish error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error during exchange publish" },
      { status: 500 }
    );
  }
}
