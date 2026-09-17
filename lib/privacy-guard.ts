import { extractOcrBoxes } from "./ocr-worker";
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
const TID_LABEL_REGEX = /\b(?:tid|txn|rrn|utr|ref|transaction\s*id|reference\s*no|trans\s*id|txn\s*id|ট্রানজেকশন\s*আইডি|রেফারেন্স)\b/i;
const SENSITIVE_LABEL_REGEX = /\b(?:tid|txn|rrn|utr|ref|transaction|reference|upi|mobile|phone|acc|account|sent\s*to|paid\s*to|to\s+[a-z]+|ট্রানজেকশন|রেফারেন্স|নম্বর)\b/i;
const DATE_TIME_LABEL_REGEX = /\b(?:date|time|dated|timestamp|সময়|সময়|তারিখ)\b/i;

export function isProtectedProofToken(raw: string): boolean {
  const clean = raw.trim();
  if (!clean) return false;

  // 1. Exact currency amount with symbol or code (e.g. ৳1,591.90, ₹1,200, $50.00, PKR 5000, ৳১,৫৯১.৯০)
  if (
    /^[৳₹$€£]\s*[\d,]+(?:\.\d{1,2})?$/.test(clean) ||
    /^(?:bdt|inr|pkr|usd|tk|rs\.?)\s*[\d,]+(?:\.\d{1,2})?$/i.test(clean) ||
    /^[৳₹$€£]?\s*\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?$/.test(clean)
  ) {
    return true;
  }

  // 2. Standalone number with 2 decimal places representing payment amount (e.g. 1591.90)
  if (/^\d{1,6}\.\d{2}$/.test(clean)) {
    return true;
  }

  // 3. Proof / Status keywords that must remain visible
  if (
    /^(?:completed|success|successful|paid|received|cash\s*out|cash\s*in|payment\s*successful|transfer\s*successful|সফল|ক্যাশ\s*আউট)$/i.test(clean)
  ) {
    return true;
  }

  // 4. Bank name or app title
  if (
    /^(?:canara\s*bank|canara|bkash|nagad|rocket|gpay|google\s*pay|phonepe|paytm|bhim)$/i.test(clean)
  ) {
    return true;
  }

  return false;
}

function classifySensitiveToken(raw: string): string | null {
  const clean = raw.trim();
  if (!clean || clean.length < 3) return null;

  // Never classify protected amounts or status labels as sensitive
  if (isProtectedProofToken(clean)) return null;

  // 1. UPI Handle or any handle containing '@'
  if (clean.includes("@") || UPI_REGEX.test(clean)) return "UPI Handle";

  // 2. Masked identifier (e.g. 03******2538)
  if (MASKED_REGEX.test(clean)) return "Masked Phone/Account";

  // 3. UUID / Alphanumeric Transaction Ref with hyphens (e.g. 01a09abc-ea83-73e1-9415-9c7d46643f41)
  if (/^[0-9a-fA-F-]{16,45}$/i.test(clean) && clean.includes("-")) {
    return "Transaction UUID / Ref";
  }

  // 4. Time pattern (e.g. 08:19pm, 8:34 pm, 20:15)
  if (
    /\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:am|pm)?\b/i.test(clean) ||
    /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/.test(clean)
  ) {
    return "Time";
  }

  // 5. Date pattern (e.g. 16/09/26, 17 Sept 2026, 2026-09-17)
  if (
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(clean) ||
    /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/.test(clean) ||
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s*,?\s*\d{2,4}\b/i.test(clean) ||
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s*,?\s*\d{2,4}\b/i.test(clean)
  ) {
    return "Date";
  }

  const digits = clean.replace(/\D/g, "");

  // 6. Pakistani Mobile (03XXXXXXXXX or +923XXXXXXXXX)
  if (
    (digits.startsWith("03") && digits.length === 11) ||
    (digits.startsWith("923") && digits.length === 12)
  ) {
    return "Pakistani Phone Number";
  }

  // 7. Bangladeshi Mobile (01XXXXXXXXX or +8801XXXXXXXXX)
  if (
    (digits.startsWith("01") && digits.length === 11) ||
    (digits.startsWith("8801") && digits.length === 13)
  ) {
    return "Bangladeshi Phone Number";
  }

  // 8. Indian Mobile (10 digits starting with 6-9, or +91)
  if (
    (digits.length === 10 && /^[6-9]/.test(digits)) ||
    (digits.startsWith("91") && digits.length === 12 && /^[6-9]/.test(digits.slice(2)))
  ) {
    return "Indian Phone Number";
  }

  // 9. Continuous 8-18 digits (TID, UTR, Ref ID, Account Number, Phone)
  if (digits.length >= 8 && digits.length <= 18) {
    return "Transaction ID / Phone / Date";
  }

  // 10. Alphanumeric reference code (e.g. DIG7KA2FCD, CICAgMJXsHBZg)
  if (/^[A-Z0-9]{8,32}$/i.test(clean)) {
    const digitCount = (clean.match(/\d/g) || []).length;
    if (digitCount >= 2) {
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

    const TARGET_OCR_WIDTH = 1500;
    const prepW = TARGET_OCR_WIDTH;
    const prepH = Math.round((origH / origW) * TARGET_OCR_WIDTH);

    const scaleX = origW / prepW;
    const scaleY = origH / prepH;

    const { words, lines } = await extractOcrBoxes(imageBuffer);

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
      if (isProtectedProofToken(word.text)) continue;
      const reason = classifySensitiveToken(word.text);
      if (reason) {
        detected.push(mapBox(word.bbox, word.text.trim(), reason));
      }
    }

    // 2. Scan entire lines & handle contextual labels (TID, Date, Time, UPI @, to Name, etc.)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineText = line.text.trim();
      if (!lineText) continue;

      // Skip lines that are purely protected amounts or status badges
      if (isProtectedProofToken(lineText)) continue;

      // (a) Line contains '@' (UPI Handle)
      if (lineText.includes("@")) {
        detected.push(mapBox(line.bbox, lineText, "UPI Handle Line"));
      }

      // (b) Line contains explicit Date & Time (e.g. "17 Sept 2026, 8:34 pm" or "08:19pm 16/09/26")
      if (
        /\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:am|pm)?\b/i.test(lineText) &&
        (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(lineText) || /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i.test(lineText))
      ) {
        detected.push(mapBox(line.bbox, lineText, "Date & Time Line"));
      }

      const hasTidLabel = TID_LABEL_REGEX.test(lineText);
      const hasSensitiveLabel = SENSITIVE_LABEL_REGEX.test(lineText);
      const hasDateTimeLabel = DATE_TIME_LABEL_REGEX.test(lineText);

      // (c) Same-line sensitive value or Date/Time value
      if (hasTidLabel || hasSensitiveLabel || hasDateTimeLabel) {
        for (const w of line.words || []) {
          const wt = w.text.trim();
          if (isProtectedProofToken(wt)) continue;
          const reason = classifySensitiveToken(wt);
          if (
            reason ||
            (hasTidLabel && /^[A-Z0-9]{6,20}$/i.test(wt)) ||
            (hasDateTimeLabel && (/\d/.test(wt) || wt.length >= 3))
          ) {
            detected.push(mapBox(w.bbox, wt, reason || (hasDateTimeLabel ? "Date/Time Value" : "TID Value")));
          }
        }

        // (d) Capture value immediately BELOW within 55px vertical threshold
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (!isProtectedProofToken(nextLine.text)) {
            const lineBottomOrig = line.bbox.y1 * scaleY;
            const nextLineTopOrig = nextLine.bbox.y0 * scaleY;
            const verticalDiff = nextLineTopOrig - lineBottomOrig;

            if (verticalDiff >= -10 && verticalDiff <= 55) {
              const nextText = nextLine.text.trim();
              if (
                nextText.includes("@") ||
                /[0-9a-fA-F-]{12,}/.test(nextText) ||
                nextText.replace(/\D/g, "").length >= 8 ||
                hasDateTimeLabel
              ) {
                detected.push(
                  mapBox(
                    nextLine.bbox,
                    nextText,
                    hasDateTimeLabel
                      ? "Date/Time Below Label"
                      : hasTidLabel
                      ? "TID Below Label"
                      : "Sensitive Below Label"
                  )
                );
              } else {
                for (const nw of nextLine.words || []) {
                  const nwt = nw.text.trim();
                  if (isProtectedProofToken(nwt)) continue;
                  const reason = classifySensitiveToken(nwt);
                  const digits = nwt.replace(/\D/g, "");
                  if (
                    reason ||
                    (hasTidLabel && digits.length >= 6) ||
                    digits.length >= 8 ||
                    hasDateTimeLabel
                  ) {
                    detected.push(
                      mapBox(
                        nw.bbox,
                        nwt,
                        reason || (hasDateTimeLabel ? "Date/Time Below Label" : "Sensitive Below Label")
                      )
                    );
                  }
                }
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
    } catch {
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
