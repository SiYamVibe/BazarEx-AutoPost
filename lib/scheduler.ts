import fs from "fs";
import path from "path";

const SCHEDULE_PATH = path.join(process.cwd(), "data", "schedule.json");
export const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_FB_SCHEDULE_LEAD_MS = 10 * 60 * 1000; // Facebook requires >= 10 mins in future

let lockPromise = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockPromise.then(fn, fn);
  lockPromise = next.then(() => {}, () => {});
  return next;
}

function ensureDataDir(): void {
  const dir = path.dirname(SCHEDULE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface ScheduleSlot {
  isScheduled: boolean;
  scheduledTimeMs: number;
  unixTimestamp?: number;
  scheduledIso?: string;
}

/**
 * Fetch the latest scheduled or published post timestamp directly from Facebook Graph API.
 * This guarantees unbroken 30-min intervals even across server restarts or redeployments.
 */
async function getLatestFacebookTime(): Promise<number> {
  const pageId = process.env.FB_PAGE_ID?.trim();
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !accessToken || pageId === "your_facebook_page_id_here") {
    return 0;
  }

  try {
    let latestTime = 0;

    // 1. Check for scheduled posts on Facebook
    const schedUrl = `https://graph.facebook.com/v19.0/${pageId}/scheduled_posts?access_token=${encodeURIComponent(accessToken)}&fields=scheduled_publish_time&limit=25`;
    const res = await fetch(schedUrl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        for (const item of json.data) {
          const t = item.scheduled_publish_time ? item.scheduled_publish_time * 1000 : 0;
          if (t > latestTime) latestTime = t;
        }
      }
    }

    // 2. If no future scheduled posts, check the latest published post's created_time
    if (latestTime === 0) {
      const feedUrl = `https://graph.facebook.com/v19.0/${pageId}/feed?access_token=${encodeURIComponent(accessToken)}&fields=created_time&limit=1`;
      const feedRes = await fetch(feedUrl, { signal: AbortSignal.timeout(6000) });
      if (feedRes.ok) {
        const feedJson = await feedRes.json();
        if (Array.isArray(feedJson.data) && feedJson.data[0]?.created_time) {
          const t = new Date(feedJson.data[0].created_time).getTime();
          if (!isNaN(t) && t > latestTime) latestTime = t;
        }
      }
    }

    return latestTime;
  } catch {
    return 0;
  }
}

export async function getNextPostSlot(): Promise<ScheduleSlot> {
  return serialize(async () => {
    ensureDataDir();
    const now = Date.now();
    let lastTime = 0;

    // 1. Read local schedule record
    try {
      if (fs.existsSync(SCHEDULE_PATH)) {
        const data = JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"));
        if (typeof data.lastScheduledTime === "number" && !isNaN(data.lastScheduledTime)) {
          lastTime = data.lastScheduledTime;
        }
      }
    } catch {}

    // 2. Sync with Facebook live API (to catch any existing scheduled queue or recent posts)
    const fbTime = await getLatestFacebookTime();
    if (fbTime > lastTime) {
      lastTime = fbTime;
    }

    // 3. If no previous posts or idle for > 30 mins: publish immediately
    if (!lastTime || now - lastTime >= INTERVAL_MS) {
      return {
        isScheduled: false,
        scheduledTimeMs: now,
      };
    }

    // 4. Calculate next slot: strictly 30 minutes after the previous slot
    let targetTime: number;
    if (lastTime > now) {
      // Future slot already queued -> add exactly 30 minutes to that future slot
      targetTime = lastTime + INTERVAL_MS;
    } else {
      // Last post was in the past (within last 30 minutes)
      targetTime = lastTime + INTERVAL_MS;
      // Ensure FB lead time (>= 10 mins in future)
      if (targetTime - now < MIN_FB_SCHEDULE_LEAD_MS) {
        targetTime = now + INTERVAL_MS;
      }
    }

    const unixTimestamp = Math.floor(targetTime / 1000);
    return {
      isScheduled: true,
      scheduledTimeMs: targetTime,
      unixTimestamp,
      scheduledIso: new Date(targetTime).toISOString(),
    };
  });
}

export async function commitPostSlot(scheduledTimeMs: number): Promise<void> {
  return serialize(async () => {
    ensureDataDir();
    const updatedData = { lastScheduledTime: scheduledTimeMs };
    const tempPath = `${SCHEDULE_PATH}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(updatedData, null, 2), "utf8");
    fs.renameSync(tempPath, SCHEDULE_PATH);
  });
}

export async function getScheduleStatus(): Promise<{
  lastScheduledTime: number | null;
  nextAvailableTime: number;
  isQueueBusy: boolean;
}> {
  return serialize(async () => {
    let lastTime = 0;
    try {
      if (fs.existsSync(SCHEDULE_PATH)) {
        const data = JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"));
        if (typeof data.lastScheduledTime === "number") lastTime = data.lastScheduledTime;
      }
    } catch {}

    const fbTime = await getLatestFacebookTime();
    if (fbTime > lastTime) lastTime = fbTime;

    const now = Date.now();
    const isQueueBusy = lastTime > 0 && (lastTime > now || now - lastTime < INTERVAL_MS);
    const nextAvailableTime = lastTime > now ? lastTime + INTERVAL_MS : (isQueueBusy ? lastTime + INTERVAL_MS : now);

    return {
      lastScheduledTime: lastTime || null,
      nextAvailableTime,
      isQueueBusy,
    };
  });
}
