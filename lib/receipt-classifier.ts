import { createWorker } from "tesseract.js";

export type CurrencyCode = "INR" | "PKR" | "BDT" | "USD";

export interface CurrencyInfo {
  code: CurrencyCode;
  label: string;
}

export const CURRENCY_MAP: Record<CurrencyCode, CurrencyInfo> = {
  INR: { code: "INR", label: "INR 🇮🇳" },
  PKR: { code: "PKR", label: "PKR 🇵🇰" },
  BDT: { code: "BDT", label: "BDT 🇧🇩" },
  USD: { code: "USD", label: "USD 🇺🇸" },
};

export function generateDefaultCaption(counter: number | string, fromCurr: string, toCurr: string): string {
  return `💸 Exchange Successful ✅
Exchange ID: #${counter}
Exchange Details:
🟢 From: ${fromCurr}
🔵 To: ${toCurr}
🤝 Thank you for trusting us with your exchange!
Join: gg.bzr.lt`;
}

const RECEIVED_PATTERNS = [
  /cash\s*out\s*successful/i,
  /received\s*from/i,
  /payment\s*received/i,
  /money\s*received/i,
  /\breceived\b/i,
  /\bcash\s*in\b/i,
  /\bcredited\b/i,
  /\bdeposit\b/i,
  /to\s*tushar/i,
  /account\s*credited/i,
];

const SENT_PATTERNS = [
  /successfully\s*sent\s*to/i,
  /sent\s*to/i,
  /\bsent\b/i,
  /transfer\s*successful/i,
  /transfer\s*success/i,
  /paid\s*to/i,
  /payment\s*to/i,
  /paid\s*successfully/i,
  /payment\s*successful/i,
  /transaction\s*successful/i,
  /\bdebited\b/i,
];

export function detectCurrency(text: string): CurrencyInfo {
  const clean = text.toLowerCase();

  // BDT check
  if (
    clean.includes("bkash") ||
    clean.includes("nagad") ||
    clean.includes("rocket") ||
    clean.includes("upay") ||
    clean.includes("bdt") ||
    clean.includes("৳") ||
    /\btk\b/i.test(text) ||
    clean.includes("cash out successful")
  ) {
    return CURRENCY_MAP.BDT;
  }

  // PKR check
  if (
    clean.includes("jazzcash") ||
    clean.includes("easypaisa") ||
    clean.includes("raast") ||
    clean.includes("pkr") ||
    clean.includes("nayapay") ||
    clean.includes("sadapay") ||
    clean.includes("meezan") ||
    clean.includes("hbl") ||
    clean.includes("bank alfalah")
  ) {
    return CURRENCY_MAP.PKR;
  }

  // INR check
  if (
    clean.includes("₹") ||
    clean.includes("inr") ||
    clean.includes("bhim") ||
    clean.includes("phonepe") ||
    clean.includes("paytm") ||
    clean.includes("gpay") ||
    clean.includes("google pay") ||
    clean.includes("kotak") ||
    /@(okhdfcbank|okaxis|ybl|ibl|axl|apl|sbi)/i.test(text)
  ) {
    return CURRENCY_MAP.INR;
  }

  // USD check
  if (
    clean.includes("usdt") ||
    clean.includes("binance") ||
    clean.includes("usd") ||
    clean.includes("$") ||
    clean.includes("pyypl") ||
    clean.includes("wise") ||
    clean.includes("trc20")
  ) {
    return CURRENCY_MAP.USD;
  }

  return CURRENCY_MAP.INR; // default fallback
}

export function scoreReceiptIntent(text: string): { receivedScore: number; sentScore: number } {
  let receivedScore = 0;
  let sentScore = 0;

  for (const pat of RECEIVED_PATTERNS) {
    if (pat.test(text)) receivedScore += 2;
  }

  for (const pat of SENT_PATTERNS) {
    if (pat.test(text)) sentScore += 2;
  }

  return { receivedScore, sentScore };
}

export async function extractOcrText(buffer: Buffer): Promise<string> {
  try {
    const worker = await createWorker("eng");
    const ret = await worker.recognize(buffer);
    await worker.terminate();
    return ret.data.text || "";
  } catch (err) {
    console.error("OCR text extraction error:", err);
    return "";
  }
}

export interface ClassificationResult {
  receivedIndex: 0 | 1;
  sentIndex: 0 | 1;
  fromCurrency: CurrencyInfo;
  toCurrency: CurrencyInfo;
  confidence: "high" | "medium" | "low";
}

export async function classifyTwoScreenshots(
  buf0: Buffer,
  buf1: Buffer
): Promise<ClassificationResult> {
  const [text0, text1] = await Promise.all([extractOcrText(buf0), extractOcrText(buf1)]);

  const score0 = scoreReceiptIntent(text0);
  const score1 = scoreReceiptIntent(text1);

  // Net direction scores: positive indicates Received, negative indicates Sent
  const net0 = score0.receivedScore - score0.sentScore;
  const net1 = score1.receivedScore - score1.sentScore;

  let receivedIndex: 0 | 1 = 0;
  let sentIndex: 0 | 1 = 1;
  let confidence: "high" | "medium" | "low" = "medium";

  if (net0 > net1) {
    // 0 is Received, 1 is Sent
    receivedIndex = 0;
    sentIndex = 1;
    confidence = Math.abs(net0 - net1) >= 2 ? "high" : "medium";
  } else if (net1 > net0) {
    // 1 is Received, 0 is Sent
    receivedIndex = 1;
    sentIndex = 0;
    confidence = Math.abs(net1 - net0) >= 2 ? "high" : "medium";
  } else {
    // Tie: default 0=Received, 1=Sent
    receivedIndex = 0;
    sentIndex = 1;
    confidence = "low";
  }

  const receivedText = receivedIndex === 0 ? text0 : text1;
  const sentText = sentIndex === 0 ? text0 : text1;

  let fromCurrency = detectCurrency(receivedText);
  let toCurrency = detectCurrency(sentText);

  // If both ended up the same due to fallback, ensure distinct default
  if (fromCurrency.code === toCurrency.code && confidence === "low") {
    fromCurrency = CURRENCY_MAP.INR;
    toCurrency = CURRENCY_MAP.PKR;
  }

  return {
    receivedIndex,
    sentIndex,
    fromCurrency,
    toCurrency,
    confidence,
  };
}
