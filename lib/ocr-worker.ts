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

async function preprocessPass1(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize({ width: 1500, withoutEnlargement: false, kernel: "lanczos3" })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.5, m1: 1, m2: 2 })
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

async function preprocessPass2(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize({ width: 1500, withoutEnlargement: false, kernel: "lanczos3" })
      .grayscale()
      .threshold(160)
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

export async function extractOcrText(buffer: Buffer): Promise<string> {
  return serializeOcr(async () => {
    try {
      const [processed1, processed2] = await Promise.all([
        preprocessPass1(buffer),
        preprocessPass2(buffer),
      ]);

      const worker = await getWorker();
      const [ret1, ret2] = await Promise.all([
        worker.recognize(processed1),
        worker.recognize(processed2),
      ]);

      const text1 = ret1.data.text || "";
      const text2 = ret2.data.text || "";
      return `${text1}\n${text2}`;
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
      const [processed1, processed2] = await Promise.all([
        preprocessPass1(buffer),
        preprocessPass2(buffer),
      ]);

      const worker = await getWorker();
      const [ret1, ret2] = await Promise.all([
        worker.recognize(processed1),
        worker.recognize(processed2),
      ]);

      const words = [...(ret1.data.words || []), ...(ret2.data.words || [])];
      const lines = [...(ret1.data.lines || []), ...(ret2.data.lines || [])];

      return { words, lines };
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
