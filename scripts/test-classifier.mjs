import assert from "node:assert";
import sharp from "sharp";
import { classifyTwoScreenshots, scoreReceiptIntent, detectCurrency } from "../lib/receipt-classifier.ts";

async function testClassifier() {
  console.log("=== Testing Classifier Pattern Scoring & Currency Detection ===");

  // Direct text scoring test
  const bkashText = "bKash Cash Out Successful to Agent 01711223344 Fee Tk 10.00";
  const easypaisaText = "EasyPaisa Successfully Sent to Muhammad Ali 03001234567 PKR 5000";

  const scoreBkash = scoreReceiptIntent(bkashText);
  const scoreEasy = scoreReceiptIntent(easypaisaText);

  assert.ok(scoreBkash.receivedScore > scoreBkash.sentScore, "bKash should score higher on RECEIVED");
  assert.ok(scoreEasy.sentScore > scoreEasy.receivedScore, "EasyPaisa should score higher on SENT");

  const currBkash = detectCurrency(bkashText);
  const currEasy = detectCurrency(easypaisaText);

  assert.strictEqual(currBkash.code, "BDT", "bKash should detect BDT");
  assert.strictEqual(currEasy.code, "PKR", "EasyPaisa should detect PKR");

  console.log("✓ Text intent and currency detection passed!");

  // Image buffers test
  const img1 = await sharp({
    create: { width: 400, height: 400, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } }
  }).png().toBuffer();

  const img2 = await sharp({
    create: { width: 400, height: 400, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } }
  }).png().toBuffer();

  const result = await classifyTwoScreenshots(img1, img2);
  assert.ok(result.receivedIndex !== undefined, "Should return receivedIndex");
  assert.ok(result.sentIndex !== undefined, "Should return sentIndex");
  console.log("✓ Image classifier fallback passed:", result);

  console.log("ALL CLASSIFIER CHECKS PASSED!");
}

testClassifier().catch((err) => {
  console.error("Classifier test failed:", err);
  process.exit(1);
});
