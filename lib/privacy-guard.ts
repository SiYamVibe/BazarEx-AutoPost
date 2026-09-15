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

// Sensitive regex patterns
const UPI_REGEX = /[\w.\-_]{2,}@(okhdfcbank|okaxis|ybl|ibl|paytm|axl|apl|sbi|postbank|barodampay|upi|fednet|yesbank|idfcbank|icici|kotak|pnb|[a-z]{3,})/i;
const MASKED_REGEX = /\b\d{2,4}[*xX]{3,10}\d{2,4}\b/;
const TID_LABEL_REGEX = /\b(?:tid|txn|rrn|utr|ref|transaction\s*id|reference\s*no|trans\s*id)\b/i;
const SENSITIVE_LABEL_REGEX = /\b(?:tid|txn|rrn|utr|ref|transaction|reference|upi|mobile|phone|acc|account|sent\s*to|paid\s*to)\b/i;

function classifySensitiveToken(raw: string): string | null {
  const clean = raw.trim();
  if (!clean || clean.length < 3) return null;

  // 1. UPI Handle
  if (UPI_REGEX.test(clean)) return "UPI Handle";

  // 2. Masked identifier (e.g. 03******2538)
  if (MASKED_REGEX.test(clean)) return "Masked Phone/Account";

  const digits = clean.replace(/\D/g, "");

  // 3. Pakistani Mobile (03XXXXXXXXX or +923XXXXXXXXX)
  if (
    (digits.startsWith("03") && digits.length === 11) ||
    (digits.startsWith("923") && digits.length === 12)
  ) {
    return "Pakistani Phone Number";
  }

  // 4. Bangladeshi Mobile (01XXXXXXXXX or +8801XXXXXXXXX)
  if (
    (digits.startsWith("01") && digits.length === 11) ||
    (digits.startsWith("8801") && digits.length === 13)
  ) {
    return "Bangladeshi Phone Number";
  }

  // 5. Indian Mobile (10 digits starting with 6-9, or +91)
  if (
    (digits.length === 10 && /^[6-9]/.test(digits)) ||
    (digits.startsWith("91") && digits.length === 12 && /^[6-9]/.test(digits.slice(2)))
  ) {
    return "Indian Phone Number";
  }

  // 6. Continuous 10-18 digits (TID, UTR, Ref ID, Account Number)
  if (
    digits.length >= 10 &&
    digits.length <= 18 &&
    !digits.startsWith("2024") &&
    !digits.startsWith("2025") &&
    !digits.startsWith("2026")
  ) {
    return "Transaction ID / Phone";
  }

  // 7. Alphanumeric reference code (e.g. CICAgMJXsHBZg)
  if (/^[A-Z0-9]{10,24}$/i.test(clean)) {
    const digitCount = (clean.match(/\d/g) || []).length;
    if (digitCount >= 3 && !clean.includes("2025") && !clean.includes("2026")) {
      return "Transaction / Ref ID";
    }
  }

  return null;
}

export async function detectSensitiveZones(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number
): Promise<BoundingBox[]> {
  const detected: BoundingBox[] = [];

  try {
    const origMeta = await sharp(imageBuffer).metadata();
    const origW = origMeta.width || imageWidth;
    const origH = origMeta.height || imageHeight;

    // Pre-processing for small/low-contrast text
    const TARGET_OCR_WIDTH = 1200;
    const preprocessedBuf = await sharp(imageBuffer)
      .resize({ width: TARGET_OCR_WIDTH, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    const prepMeta = await sharp(preprocessedBuf).metadata();
    const prepW = prepMeta.width || TARGET_OCR_WIDTH;
    const prepH = prepMeta.height || Math.round((origH / origW) * TARGET_OCR_WIDTH);

    const scaleX = origW / prepW;
    const scaleY = origH / prepH;

    const worker = await createWorker("eng");
    const ret = await worker.recognize(preprocessedBuf);
    await worker.terminate();

    const words = ret.data.words || [];
    const lines = ret.data.lines || [];

    const mapBox = (
      bbox: { x0: number; y0: number; x1: number; y1: number },
      text: string,
      reason: string
    ): BoundingBox => {
      const x0 = bbox.x0 * scaleX;
      const y0 = bbox.y0 * scaleY;
      const x1 = bbox.x1 * scaleX;
      const y1 = bbox.y1 * scaleY;

      // 10px safety padding (x - 5, y - 4, w + 10, h + 8)
      const finalX = Math.max(0, Math.round(x0 - 5));
      const finalY = Math.max(0, Math.round(y0 - 4));
      const finalW = Math.min(origW - finalX, Math.max(12, Math.round(x1 - x0 + 10)));
      const finalH = Math.min(origH - finalY, Math.max(12, Math.round(y1 - y0 + 8)));

      return {
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        text,
        reason,
      };
    };

    // 1. Scan single words
    for (const word of words) {
      const reason = classifySensitiveToken(word.text);
      if (reason) {
        detected.push(mapBox(word.bbox, word.text.trim(), reason));
      }
    }

    // 2. Scan lines & handle adjacent / below labels (TID, Transaction ID, Sent To, etc.)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineText = line.text.trim();
      if (!lineText) continue;

      const hasTidLabel = TID_LABEL_REGEX.test(lineText);
      const hasSensitiveLabel = SENSITIVE_LABEL_REGEX.test(lineText);

      // (a) Check same-line value
      if (hasTidLabel || hasSensitiveLabel) {
        for (const w of line.words || []) {
          const wt = w.text.trim();
          const reason = classifySensitiveToken(wt);
          if (reason || (hasTidLabel && /^\d{6,18}$/.test(wt.replace(/\D/g, "")))) {
            detected.push(mapBox(w.bbox, wt, reason || "TID Value"));
          }
        }

        // (b) Capture value immediately BELOW within 45px vertical threshold
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const lineBottomOrig = line.bbox.y1 * scaleY;
          const nextLineTopOrig = nextLine.bbox.y0 * scaleY;
          const verticalDiff = nextLineTopOrig - lineBottomOrig;

          if (verticalDiff >= -10 && verticalDiff <= 45) {
            for (const nw of nextLine.words || []) {
              const nwt = nw.text.trim();
              const reason = classifySensitiveToken(nwt);
              const digits = nwt.replace(/\D/g, "");
              if (reason || (hasTidLabel && digits.length >= 6) || digits.length >= 8) {
                detected.push(mapBox(nw.bbox, nwt, reason || (hasTidLabel ? "TID Below Label" : "Sensitive Below Label")));
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Hardened OCR detection error:", err);
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
      return overlapArea > 0.45 * bArea;
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
      // Gaussian blur region (sigma: 19) + sleek dark censor overlay
      const blurredPatch = await sharp(sourceBuffer)
        .extract({ left: b.x, top: b.y, width: b.width, height: b.height })
        .blur(19)
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
