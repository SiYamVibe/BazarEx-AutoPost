import fs from "fs";
import path from "path";

const SCHEDULE_PATH = path.join(process.cwd(), "data", "schedule.json");
export const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

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

    // If no previous post, or last post was more than 30 minutes ago: publish immediately
    if (!lastTime || now - lastTime >= INTERVAL_MS) {
      return {
        isScheduled: false,
        scheduledTimeMs: now,
      };
    }

    // Schedule:
    // 1. If previous post is already queued in the future (lastTime > now), add exactly 30 minutes to that future slot.
    // 2. If previous post was in the past (within the last 30 minutes), the next slot must be now + 30 minutes.
    let targetTime: number;
    if (lastTime > now) {
      targetTime = lastTime + INTERVAL_MS;
    } else {
      targetTime = now + INTERVAL_MS;
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

    const now = Date.now();
    const isQueueBusy = lastTime > 0 && (lastTime > now || now - lastTime < INTERVAL_MS);
    const nextAvailableTime = lastTime > now ? lastTime + INTERVAL_MS : (isQueueBusy ? now + INTERVAL_MS : now);

    return {
      lastScheduledTime: lastTime || null,
      nextAvailableTime,
      isQueueBusy,
    };
  });
}
