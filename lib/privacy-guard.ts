import { createWorker } from "tesseract.js";
import sharp from "sharp";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  reason?: string;
}

const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}|\b\d{2,4}[*xX]{3,10}\d{2,4}\b|(?:\+?92|0)?3\d{2}[-.\s]?\d{7}|(?:\+?91)?[6-9]\d{9}/i;
const UPI_REGEX = /[\w.\-_]{2,}@(okhdfcbank|okaxis|ybl|ibl|paytm|axl|apl|sbi|postbank|barodampay|upi|fednet|yesbank|idfcbank|icici|kotak|pnb|[a-z]{3,})/i;
const TXN_ID_PREFIX_REGEX = /(?:txn|txnid|ref|rrn|utr|id|order|trans|receipt)[:\s#]*([A-Z0-9]{6,24})/i;
const STANDALONE_ID_REGEX = /\b[A-Z0-9]{10,24}\b|\b\d{10,20}\b/;
const ACCOUNT_REGEX = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b|\b\d{9,18}\b/;

export async function detectSensitiveZones(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number
): Promise<BoundingBox[]> {
  const detected: BoundingBox[] = [];

  try {
    const worker = await createWorker("eng");
    const ret = await worker.recognize(imageBuffer);
    await worker.terminate();

    const words = ret.data.words || [];
    const lines = ret.data.lines || [];

    // 1. Scan single words
    for (const word of words) {
      const clean = word.text.trim();
      if (!clean || clean.length < 3) continue;

      let matchedReason = "";
      if (UPI_REGEX.test(clean)) {
        matchedReason = "UPI Handle";
      } else if (PHONE_REGEX.test(clean) && clean.replace(/\D/g, "").length >= 7) {
        matchedReason = "Phone Number";
      } else if (STANDALONE_ID_REGEX.test(clean) && !clean.includes("202") && !clean.includes("1080")) {
        matchedReason = "Ref / Txn ID";
      } else if (ACCOUNT_REGEX.test(clean)) {
        matchedReason = "Account Number";
      }

      if (matchedReason) {
        const bbox = word.bbox;
        detected.push({
          x: Math.max(0, bbox.x0 - 4),
          y: Math.max(0, bbox.y0 - 2),
          width: Math.min(imageWidth, bbox.x1 - bbox.x0 + 8),
          height: Math.min(imageHeight, bbox.y1 - bbox.y0 + 4),
          text: clean,
          reason: matchedReason,
        });
      }
    }

    // 2. Scan lines for composite expressions (e.g., "Ref No: 1293847192" or "UPI: name@okhdfcbank")
    for (const line of lines) {
      const lineText = line.text.trim();
      if (!lineText) continue;

      if (TXN_ID_PREFIX_REGEX.test(lineText) || UPI_REGEX.test(lineText)) {
        const lineWords = line.words || [];
        for (let i = 0; i < lineWords.length; i++) {
          const w = lineWords[i];
          const wt = w.text.trim();
          if (
            STANDALONE_ID_REGEX.test(wt) ||
            UPI_REGEX.test(wt) ||
            PHONE_REGEX.test(wt) ||
            ACCOUNT_REGEX.test(wt)
          ) {
            const bbox = w.bbox;
            detected.push({
              x: Math.max(0, bbox.x0 - 4),
              y: Math.max(0, bbox.y0 - 2),
              width: Math.min(imageWidth, bbox.x1 - bbox.x0 + 8),
              height: Math.min(imageHeight, bbox.y1 - bbox.y0 + 4),
              text: wt,
              reason: "Sensitive Field",
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("OCR detection failed:", err);
  }

  // Deduplicate overlapping boxes
  return deduplicateBoxes(detected);
}

function deduplicateBoxes(boxes: BoundingBox[]): BoundingBox[] {
  const results: BoundingBox[] = [];

  for (const b of boxes) {
    const isDuplicate = results.some((existing) => {
      const overlapX = Math.max(0, Math.min(b.x + b.width, existing.x + existing.width) - Math.max(b.x, existing.x));
      const overlapY = Math.max(0, Math.min(b.y + b.height, existing.y + existing.height) - Math.max(b.y, existing.y));
      const overlapArea = overlapX * overlapY;
      const bArea = b.width * b.height;
      return overlapArea > 0.5 * bArea;
    });

    if (!isDuplicate) {
      results.push(b);
    }
  }

  return results;
}

export async function applyBlurRedactions(
  sourceBuffer: Buffer,
  boxes: BoundingBox[]
): Promise<Buffer> {
  if (!boxes || boxes.length === 0) {
    return sourceBuffer;
  }

  const meta = await sharp(sourceBuffer).metadata();
  const imgWidth = meta.width || 1080;
  const imgHeight = meta.height || 1920;

  const validBoxes = boxes
    .map((b) => ({
      x: Math.max(0, Math.round(b.x)),
      y: Math.max(0, Math.round(b.y)),
      width: Math.max(10, Math.min(imgWidth - Math.max(0, Math.round(b.x)), Math.round(b.width))),
      height: Math.max(10, Math.min(imgHeight - Math.max(0, Math.round(b.y)), Math.round(b.height))),
    }))
    .filter((b) => b.x + b.width <= imgWidth && b.y + b.height <= imgHeight);

  if (validBoxes.length === 0) return sourceBuffer;

  const composites: sharp.OverlayOptions[] = [];

  for (const b of validBoxes) {
    try {
      // Gaussian blur region + sleek dark censor pill overlay
      const blurredPatch = await sharp(sourceBuffer)
        .extract({ left: b.x, top: b.y, width: b.width, height: b.height })
        .blur(18)
        .composite([
          {
            input: Buffer.from(
              `<svg width="${b.width}" height="${b.height}"><rect width="${b.width}" height="${b.height}" rx="6" fill="#090a0ecc" /></svg>`
            ),
          },
        ])
        .toBuffer();

      composites.push({
        input: blurredPatch,
        left: b.x,
        top: b.y,
      });
    } catch (e) {
      // Fallback: SVG blackout pill if extraction fails
      const pillSvg = `<svg width="${b.width}" height="${b.height}"><rect width="${b.width}" height="${b.height}" rx="6" fill="#0d0e12ee" stroke="#232733" stroke-width="1"/></svg>`;
      composites.push({
        input: Buffer.from(pillSvg),
        left: b.x,
        top: b.y,
      });
    }
  }

  return sharp(sourceBuffer).composite(composites).toBuffer();
}
