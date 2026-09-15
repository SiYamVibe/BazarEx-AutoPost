import fs from "fs";
import path from "path";

const COUNTER_PATH = path.join(process.cwd(), "data", "counter.json");
const DEFAULT_START = 11042;

let lockPromise = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockPromise.then(fn, fn);
  lockPromise = next.then(() => {}, () => {});
  return next;
}

function ensureDataDir(): void {
  const dir = path.dirname(COUNTER_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function getCounter(): Promise<number> {
  return serialize(async () => {
    try {
      if (!fs.existsSync(COUNTER_PATH)) {
        ensureDataDir();
        fs.writeFileSync(COUNTER_PATH, JSON.stringify({ exchangeNo: DEFAULT_START }, null, 2));
        return DEFAULT_START;
      }
      const data = JSON.parse(fs.readFileSync(COUNTER_PATH, "utf8"));
      if (typeof data.exchangeNo === "number" && !isNaN(data.exchangeNo)) {
        return data.exchangeNo;
      }
      return DEFAULT_START;
    } catch {
      return DEFAULT_START;
    }
  });
}

export async function setCounter(val: number): Promise<number> {
  return serialize(async () => {
    ensureDataDir();
    const tempPath = `${COUNTER_PATH}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const num = Math.floor(Number(val));
    const safeVal = isNaN(num) ? DEFAULT_START : num;
    fs.writeFileSync(tempPath, JSON.stringify({ exchangeNo: safeVal }, null, 2), "utf8");
    fs.renameSync(tempPath, COUNTER_PATH);
    return safeVal;
  });
}

export async function incrementCounter(): Promise<number> {
  return serialize(async () => {
    let current = DEFAULT_START;
    try {
      if (fs.existsSync(COUNTER_PATH)) {
        const data = JSON.parse(fs.readFileSync(COUNTER_PATH, "utf8"));
        if (typeof data.exchangeNo === "number" && !isNaN(data.exchangeNo)) {
          current = data.exchangeNo;
        }
      }
    } catch {}

    const nextVal = current + 1;
    ensureDataDir();
    const tempPath = `${COUNTER_PATH}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ exchangeNo: nextVal }, null, 2), "utf8");
    fs.renameSync(tempPath, COUNTER_PATH);
    return nextVal;
  });
}
