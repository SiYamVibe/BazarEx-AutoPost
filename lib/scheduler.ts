import fs from "fs";
import path from "path";

const SCHEDULE_PATH = path.join(process.cwd(), "data", "schedule.json");
export const INTERVAL_MS = 25 * 60 * 1000; // 25 minutes
const MIN_FB_SCHEDULE_LEAD_MS = 10 * 60 * 1000; // FB requires >= 10 mins in future

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

export async function getNextPostSlot(): Promise<ScheduleSlot> {
  return serialize(async () => {
    ensureDataDir();
    const now = Date.now();
    let lastTime = 0;

    try {
      if (fs.existsSync(SCHEDULE_PATH)) {
        const data = JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"));
        if (typeof data.lastScheduledTime === "number" && !isNaN(data.lastScheduledTime)) {
          lastTime = data.lastScheduledTime;
        }
      }
    } catch {}

    // If no previous post, or last post was more than 25 minutes ago: publish immediately
    if (!lastTime || now - lastTime >= INTERVAL_MS) {
      const updatedData = { lastScheduledTime: now };
      const tempPath = `${SCHEDULE_PATH}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(updatedData, null, 2), "utf8");
      fs.renameSync(tempPath, SCHEDULE_PATH);

      return {
        isScheduled: false,
        scheduledTimeMs: now,
      };
    }

    // Schedule 25 minutes after previous post
    let targetTime = lastTime + INTERVAL_MS;

    // Ensure it respects Facebook Graph API lead time (>= 10 mins from now)
    if (targetTime - now < MIN_FB_SCHEDULE_LEAD_MS) {
      targetTime = now + MIN_FB_SCHEDULE_LEAD_MS + 60000; // +11 mins safety
    }

    const updatedData = { lastScheduledTime: targetTime };
    const tempPath = `${SCHEDULE_PATH}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(updatedData, null, 2), "utf8");
    fs.renameSync(tempPath, SCHEDULE_PATH);

    const unixTimestamp = Math.floor(targetTime / 1000);
    return {
      isScheduled: true,
      scheduledTimeMs: targetTime,
      unixTimestamp,
      scheduledIso: new Date(targetTime).toISOString(),
    };
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

    const now = Date.now();
    const isQueueBusy = lastTime > 0 && now - lastTime < INTERVAL_MS;
    const nextAvailableTime = isQueueBusy ? lastTime + INTERVAL_MS : now;

    return {
      lastScheduledTime: lastTime || null,
      nextAvailableTime,
      isQueueBusy,
    };
  });
}
