import { extractOcrText } from "./ocr-worker";
export { extractOcrText };

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

export function generateDefaultCaption(
  counter: number | string,
  fromCurr: string,
  toCurr: string
): string {
  const fromMatch = fromCurr.match(/\b(BDT|INR|PKR|USD)\b/i);
  const toMatch = toCurr.match(/\b(BDT|INR|PKR|USD)\b/i);
  const fromCode = (fromMatch ? fromMatch[1] : fromCurr.replace(/[^a-zA-Z]/g, "")).toLowerCase();
  const toCode = (toMatch ? toMatch[1] : toCurr.replace(/[^a-zA-Z]/g, "")).toLowerCase();
  const pairTag = fromCode && toCode ? `#${fromCode}2${toCode}` : "";

  return `💸 Exchange Successful ✅
Exchange ID: #${counter}
Exchange Details:
🟢 From: ${fromCurr}
🔵 To: ${toCurr}
🤝 Thank you for trusting us with your exchange!
🔗 Join: Link In Bio

${pairTag ? `${pairTag} ` : ""}#bazarexchange`;
}

const RECEIVED_PATTERNS = [
  /cash\s*out/i,
  /ক্যাশ\s*আউট/i,
  /ক্যাশ\s*ইন/i,
  /received\s*from/i,
  /payment\s*received/i,
  /money\s*received/i,
  /\breceived\b/i,
  /\bcash\s*in\b/i,
  /\bcredited\b/i,
  /\bdeposit\b/i,
  /account\s*credited/i,
  /জমা\s*হয়েছে/i,
  /গ্রহণ\s*করেছেন/i,
];

const SENT_PATTERNS = [
  /সেন্ড\s*মানি/i,
  /send\s*money/i,
  /successfully\s*sent\s*to/i,
  /successfully\s*sent/i,
  /sent\s*to/i,
  /\bsent\b/i,
  /\bpay\s*again\b/i,
  /\bcompleted\b/i,
  /\bto\s+[a-z]+/i,
  /\bupi\s*transaction\s*id\b/i,
  /canara\s*bank/i,
  /transfer\s*successful/i,
  /transfer\s*success/i,
  /paid\s*to/i,
  /payment\s*to/i,
  /paid\s*successfully/i,
  /payment\s*successful/i,
  /transaction\s*successful/i,
  /\bdebited\b/i,
  /পাঠানো\s*হয়েছে/i,
];


export function detectCurrency(text: string): CurrencyInfo {
  const clean = text.toLowerCase();

  // 1. BDT check (Comprehensive bKash, Nagad, Rocket, Upay, Cellfin & Bengali patterns)
  if (
    clean.includes("bkash") ||
    clean.includes("বিকাশ") ||
    clean.includes("nagad") ||
    clean.includes("নগদ") ||
    clean.includes("rocket") ||
    clean.includes("রকেট") ||
    clean.includes("upay") ||
    clean.includes("উপায়") ||
    clean.includes("cellfin") ||
    clean.includes("সেলফিন") ||
    clean.includes("bdt") ||
    clean.includes("৳") ||
    /\btk\b/i.test(text) ||
    /\btaka\b/i.test(text) ||
    /\bcash\s*out\b/i.test(text) ||
    /ক্যাশ\s*আউট/i.test(text) ||
    /ক্যাশ\s*ইন/i.test(text) ||
    /সেন্ড\s*মানি/i.test(text) ||
    /সর্বমোট/i.test(text) ||
    /নতুন\s*ব্যালেন্স/i.test(text) ||
    /রিওয়ার্ড/i.test(text) ||
    /ট্রানজেকশন/i.test(text) ||
    /স্টেটমেন্ট/i.test(text) ||
    /টাকা/i.test(text) ||
    /\b01[3-9]\d{8}\b/.test(text)
  ) {
    return CURRENCY_MAP.BDT;
  }

  // 2. PKR check
  if (
    clean.includes("jazzcash") ||
    clean.includes("easypaisa") ||
    clean.includes("raast") ||
    clean.includes("pkr") ||
    clean.includes("nayapay") ||
    clean.includes("sadapay") ||
    clean.includes("meezan") ||
    clean.includes("hbl") ||
    clean.includes("bank alfalah") ||
    /\brs\.?\s*\d+/i.test(text)
  ) {
    return CURRENCY_MAP.PKR;
  }

  // 3. INR check
  if (
    clean.includes("₹") ||
    clean.includes("inr") ||
    clean.includes("bhim") ||
    clean.includes("phonepe") ||
    clean.includes("paytm") ||
    clean.includes("gpay") ||
    clean.includes("google pay") ||
    clean.includes("kotak") ||
    clean.includes("canara") ||
    clean.includes("pay again") ||
    clean.includes("upi transaction id") ||
    /@(okhdfcbank|okaxis|ybl|ibl|axl|apl|sbi|postbank|upi)/i.test(text)
  ) {
    return CURRENCY_MAP.INR;
  }

  // 4. USD check (Must require explicit USD / USDT / Crypto tokens, not bare noise '$')
  if (
    clean.includes("usdt") ||
    clean.includes("binance") ||
    clean.includes("usd") ||
    clean.includes("pyypl") ||
    clean.includes("wise") ||
    clean.includes("trc20") ||
    clean.includes("bep20") ||
    clean.includes("payeer") ||
    clean.includes("perfect money") ||
    /\$\s*\d+(?:\.\d{2})?/.test(text)
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

export interface ClassificationResult {
  receivedIndex: 0 | 1;
  sentIndex: 0 | 1;
  fromCurrency: CurrencyInfo;
  toCurrency: CurrencyInfo;
  confidence: "high" | "medium" | "low";
}

export interface ClassificationOptions {
  fromCurrencyHint?: CurrencyCode | string;
  toCurrencyHint?: CurrencyCode | string;
  receivedIndexHint?: 0 | 1;
}

export async function classifyTwoScreenshots(
  buf0: Buffer,
  buf1: Buffer,
  options?: ClassificationOptions
): Promise<ClassificationResult> {
  const text0 = await extractOcrText(buf0);
  const text1 = await extractOcrText(buf1);

  const score0 = scoreReceiptIntent(text0);
  const score1 = scoreReceiptIntent(text1);

  // Net direction scores: positive indicates Received, negative indicates Sent
  const net0 = score0.receivedScore - score0.sentScore;
  const net1 = score1.receivedScore - score1.sentScore;

  let receivedIndex: 0 | 1 = 0;
  let sentIndex: 0 | 1 = 1;
  let confidence: "high" | "medium" | "low" = "medium";

  if (options?.receivedIndexHint !== undefined) {
    receivedIndex = options.receivedIndexHint;
    sentIndex = receivedIndex === 0 ? 1 : 0;
    confidence = "high";
  } else if (net0 > net1) {
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

  // Apply explicit hints if provided
  if (options?.fromCurrencyHint) {
    const code = options.fromCurrencyHint.toUpperCase() as CurrencyCode;
    if (CURRENCY_MAP[code]) fromCurrency = CURRENCY_MAP[code];
  }
  if (options?.toCurrencyHint) {
    const code = options.toCurrencyHint.toUpperCase() as CurrencyCode;
    if (CURRENCY_MAP[code]) toCurrency = CURRENCY_MAP[code];
  }

  // If both ended up the same due to fallback, ensure distinct default
  if (fromCurrency.code === toCurrency.code && confidence === "low") {
    fromCurrency = CURRENCY_MAP.BDT;
    toCurrency = CURRENCY_MAP.INR;
  }

  return {
    receivedIndex,
    sentIndex,
    fromCurrency,
    toCurrency,
    confidence,
  };
}
