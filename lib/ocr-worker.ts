import { createWorker, type Worker } from "tesseract.js";
import sharp from "sharp";

let sharedWorker: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;
let ocrLock = Promise.resolve();

async function getWorker(): Promise<Worker> {
  if (sharedWorker) return sharedWorker;
  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = (async () => {
    try {
      // Initialize with both English and Bengali for seamless dual recognition
      let worker: Worker;
      try {
        worker = await createWorker("eng+ben");
      } catch {
        worker = await createWorker("eng");
      }
      sharedWorker = worker;
      return worker;
    } finally {
      workerInitPromise = null;
    }
  })();

  return workerInitPromise;
}

function serializeOcr<T>(fn: () => Promise<T>): Promise<T> {
  const next = ocrLock.then(fn, fn);
  ocrLock = next.then(() => {}, () => {});
  return next;
}

async function preprocessForOcr(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize({ width: 1400, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

export async function extractOcrText(buffer: Buffer): Promise<string> {
  return serializeOcr(async () => {
    try {
      const processed = await preprocessForOcr(buffer);
      const worker = await getWorker();
      const ret = await worker.recognize(processed);
      return ret.data.text || "";
    } catch (err) {
      console.error("OCR extract error, resetting worker:", err);
      if (sharedWorker) {
        try {
          await sharedWorker.terminate();
        } catch {}
        sharedWorker = null;
      }
      return "";
    }
  });
}

export async function extractOcrBoxes(buffer: Buffer): Promise<{
  words: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  lines: Array<{
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }>;
}> {
  return serializeOcr(async () => {
    try {
      const worker = await getWorker();
      const ret = await worker.recognize(buffer);
      return {
        words: ret.data.words || [],
        lines: ret.data.lines || [],
      };
    } catch (err) {
      console.error("OCR boxes error, resetting worker:", err);
      if (sharedWorker) {
        try {
          await sharedWorker.terminate();
        } catch {}
        sharedWorker = null;
      }
      return { words: [], lines: [] };
    }
  });
}
