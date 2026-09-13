import assert from "node:assert";
import sharp from "sharp";
import { getCounter, setCounter, incrementCounter } from "../lib/counter.ts";
import { compositeExchangeCard } from "../lib/image-processor.ts";
import { applyBlurRedactions } from "../lib/privacy-guard.ts";

async function runTests() {
  console.log("=== 1. Testing Counter Logic & Concurrency ===");
  await setCounter(11042);
  let c = await getCounter();
  assert.strictEqual(c, 11042, "Initial counter should be 11042");

  // Parallel increments
  await Promise.all([
    incrementCounter(),
    incrementCounter(),
    incrementCounter(),
  ]);
  c = await getCounter();
  assert.strictEqual(c, 11045, "Counter should be 11045 after 3 parallel increments");
  console.log("✓ Concurrency & Counter safe. Value:", c);

  // Reset back to 11042 for fresh start
  await setCounter(11042);

  console.log("=== 2. Testing Image Redactions & Compositing ===");
  // Generate sample fake payment receipt
  const sampleReceipt = await sharp({
    create: {
      width: 720,
      height: 1280,
      channels: 4,
      background: { r: 18, g: 22, b: 30, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(`
          <svg width="720" height="1280">
            <text x="50" y="100" font-family="sans-serif" font-size="28" fill="#fff">Payment Received</text>
            <text x="50" y="200" font-family="sans-serif" font-size="24" fill="#00ff00">Phone: 03123456789</text>
            <text x="50" y="300" font-family="sans-serif" font-size="24" fill="#00ff00">UPI: user@okhdfcbank</text>
            <text x="50" y="400" font-family="sans-serif" font-size="24" fill="#00ff00">Ref ID: TXN998877665544</text>
          </svg>
        `),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  const redactedReceipt = await applyBlurRedactions(sampleReceipt, [
    { x: 40, y: 175, width: 350, height: 40, reason: "Phone" },
    { x: 40, y: 275, width: 350, height: 40, reason: "UPI" },
    { x: 40, y: 375, width: 450, height: 40, reason: "Ref ID" },
  ]);

  const compositeBuffer = await compositeExchangeCard({
    receivedImageBuffer: redactedReceipt,
    sentImageBuffer: redactedReceipt,
    exchangeNo: 11042,
  });

  const meta = await sharp(compositeBuffer).metadata();
  assert.strictEqual(meta.width, 1080, "Composite width must be 1080");
  assert.strictEqual(meta.height, 1080, "Composite height must be 1080");
  assert.strictEqual(meta.format, "png", "Composite format must be PNG");
  console.log("✓ Image compositor generated valid 1080x1080 PNG buffer:", compositeBuffer.length, "bytes");

  console.log("ALL VERIFICATION CHECKS PASSED!");
}

runTests().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
