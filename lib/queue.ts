import fs from "fs";
import path from "path";
import sharp from "sharp";
import { classifyTwoScreenshots, generateDefaultCaption } from "./receipt-classifier";
import { detectSensitiveZones, applyBlurRedactions } from "./privacy-guard";
import { compositeExchangeCard } from "./image-processor";
import { getNextPostSlot, commitPostSlot } from "./scheduler";

export interface QueueJob {
  id: string;
  images: string[];
  exchangeNo: string | number;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  postUrl?: string;
  schedule?: any;
}

const QUEUE_FILE = path.join(process.cwd(), "data", "queue.json");
let isWorkerRunning = false;
let jobsMemory: QueueJob[] | null = null;

function ensureDataDir(): void {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadJobs(): QueueJob[] {
  if (jobsMemory !== null) return jobsMemory;
  try {
    ensureDataDir();
    if (fs.existsSync(QUEUE_FILE)) {
      jobsMemory = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
      // Reset any stuck 'processing' jobs on restart back to 'queued'
      let updated = false;
      for (const j of jobsMemory || []) {
        if (j.status === "processing") {
          j.status = "queued";
          updated = true;
        }
      }
      if (updated) saveJobs();
      return jobsMemory || [];
    }
  } catch (err) {
    console.error("Failed to load queue.json:", err);
  }
  jobsMemory = [];
  return jobsMemory;
}

function saveJobs(): void {
  try {
    ensureDataDir();
    const tempPath = `${QUEUE_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(jobsMemory || [], null, 2), "utf8");
    fs.renameSync(tempPath, QUEUE_FILE);
  } catch (err) {
    console.error("Failed to save queue.json:", err);
  }
}

export function enqueueBotExchange(images: string[], exchangeNo: string | number): {
  job: QueueJob;
  queuePosition: number;
  totalPending: number;
} {
  const jobs = loadJobs();
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const newJob: QueueJob = {
    id,
    images,
    exchangeNo,
    status: "queued",
    createdAt: Date.now(),
  };

  jobs.push(newJob);
  saveJobs();

  const pending = jobs.filter((j) => j.status === "queued" || j.status === "processing");
  const queuePosition = pending.findIndex((j) => j.id === id) + 1;

  // Trigger background processor asynchronously
  triggerWorker();

  return {
    job: newJob,
    queuePosition: queuePosition > 0 ? queuePosition : 1,
    totalPending: pending.length,
  };
}

export function getJobById(id: string): QueueJob | undefined {
  const jobs = loadJobs();
  return jobs.find((j) => j.id === id);
}

export function getQueueStatus(): {
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  currentJob: QueueJob | null;
} {
  const jobs = loadJobs();
  const current = jobs.find((j) => j.status === "processing") || null;
  return {
    queuedCount: jobs.filter((j) => j.status === "queued").length,
    processingCount: current ? 1 : 0,
    completedCount: jobs.filter((j) => j.status === "completed").length,
    failedCount: jobs.filter((j) => j.status === "failed").length,
    currentJob: current,
  };
}

function triggerWorker(): void {
  if (isWorkerRunning) return;
  // Fire and forget in next tick
  setImmediate(() => {
    runWorkerLoop().catch((err) => console.error("Worker loop unhandled error:", err));
  });
}

async function runWorkerLoop(): Promise<void> {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  try {
    while (true) {
      const jobs = loadJobs();
      const nextJob = jobs.find((j) => j.status === "queued");

      if (!nextJob) {
        break; // Queue is empty
      }

      nextJob.status = "processing";
      nextJob.startedAt = Date.now();
      saveJobs();

      console.log(`[Queue Worker] Starting job ${nextJob.id} (Exchange #${nextJob.exchangeNo})...`);

      try {
        await processJob(nextJob);
        nextJob.status = "completed";
        nextJob.completedAt = Date.now();
        console.log(`[Queue Worker] Completed job ${nextJob.id} (Exchange #${nextJob.exchangeNo})`);
      } catch (err: any) {
        console.error(`[Queue Worker] Failed job ${nextJob.id}:`, err);
        nextJob.status = "failed";
        nextJob.error = err?.message || String(err);
        nextJob.completedAt = Date.now();
      }

      saveJobs();
      // Small pause between heavy jobs to let CPU breathe
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    isWorkerRunning = false;
  }
}

async function processJob(job: QueueJob): Promise<void> {
  const { images, exchangeNo } = job;

  // 1. Ingest images
  const buffers = await Promise.all(
    images.map(async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Failed to fetch image from ${url} (HTTP ${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    })
  );

  // 2. Classify Received vs Sent & Detect Currencies
  const classification = await classifyTwoScreenshots(buffers[0], buffers[1]);
  const receivedBuf = buffers[classification.receivedIndex];
  const sentBuf = buffers[classification.sentIndex];

  // 3. Privacy Guard
  const [recMeta, sentMeta] = await Promise.all([
    sharp(receivedBuf).metadata(),
    sharp(sentBuf).metadata(),
  ]);

  const [boxesReceived, boxesSent] = await Promise.all([
    detectSensitiveZones(receivedBuf, recMeta.width || 1080, recMeta.height || 1920),
    detectSensitiveZones(sentBuf, sentMeta.width || 1080, sentMeta.height || 1920),
  ]);

  const [sanitizedReceived, sanitizedSent] = await Promise.all([
    applyBlurRedactions(receivedBuf, boxesReceived),
    applyBlurRedactions(sentBuf, boxesSent),
  ]);

  // 4. Composite artwork
  const finalizedBuffer = await compositeExchangeCard({
    receivedImageBuffer: sanitizedReceived,
    sentImageBuffer: sanitizedSent,
    exchangeNo,
  });

  // 5. Generate caption
  const caption = generateDefaultCaption(
    exchangeNo,
    classification.fromCurrency.label,
    classification.toCurrency.label
  );

  // 6. Schedule / Post to Meta Graph API
  const pageId = process.env.FB_PAGE_ID?.trim();
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN?.trim();
  const isMock = !pageId || !accessToken || pageId === "your_facebook_page_id_here";

  const scheduleSlot = await getNextPostSlot();
  job.schedule = scheduleSlot;

  if (isMock) {
    const mockPostId = `108${Math.floor(Math.random() * 900000000 + 100000000)}`;
    job.postUrl = `https://facebook.com/${mockPostId}`;
    await commitPostSlot(scheduleSlot.scheduledTimeMs);
  } else {
    const metaFormData = new FormData();
    const imageBlob = new Blob([new Uint8Array(finalizedBuffer)], { type: "image/png" });
    metaFormData.append("source", imageBlob, `exchange_${exchangeNo}.png`);
    metaFormData.append("message", caption);

    if (scheduleSlot.isScheduled && scheduleSlot.unixTimestamp) {
      metaFormData.append("published", "false");
      metaFormData.append("scheduled_publish_time", scheduleSlot.unixTimestamp.toString());
    } else {
      metaFormData.append("published", "true");
    }

    const fbUrl = `https://graph.facebook.com/v19.0/${pageId}/photos?access_token=${encodeURIComponent(accessToken)}`;
    const fbRes = await fetch(fbUrl, {
      method: "POST",
      body: metaFormData,
      signal: AbortSignal.timeout(30000),
    });

    const responseText = await fbRes.text();
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { error: { message: responseText } };
    }

    if (!fbRes.ok) {
      throw new Error(parsed.error?.message || `Meta API request failed with status ${fbRes.status}`);
    }

    job.postUrl = parsed.permalink_url || (parsed.id ? `https://facebook.com/${parsed.id}` : "");
    await commitPostSlot(scheduleSlot.scheduledTimeMs);
  }
}

// Auto-trigger on module load if any pending jobs exist from previous restart
if (typeof setImmediate !== "undefined") {
  setImmediate(() => triggerWorker());
}
