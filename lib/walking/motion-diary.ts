import { kstDate } from "@/lib/judge/time";

export type MotionWalk = {
  id: string;
  owner?: string;
  source: 'device-motion';
  startedAt: number;
  lastStepAt: number;
  steps: number;
  dailySteps?: Record<string, number>;
};

export function motionStepsOn(walks: MotionWalk[], day: string): number | null {
  let total: number | null = null;
  for (const walk of walks) {
    // Older diaries have only session totals. A session wholly within a day is unambiguous.
    const count = walk.dailySteps ? walk.dailySteps[day] :
      kstDate(new Date(walk.startedAt)) === day && kstDate(new Date(walk.lastStepAt)) === day ? walk.steps : undefined;
    if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0 && count <= walk.steps)
      total = (total ?? 0) + count;
  }
  return total;
}

const WALKS = 'walks';
const RECORDER = 'recorder';
const LEASE_MS = 12_000;

const validTime = (value: number) => Number.isFinite(new Date(value).getTime()) && Number.isSafeInteger(value) && value > 0;

export function openMotionDiary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bapmunna.walking.device-motion', 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(WALKS, { keyPath: 'id' });
      db.createObjectStore(RECORDER);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('diary-blocked')); };
  });
}

export function readMotionWalks(db: IDBDatabase, owner?: string): Promise<MotionWalk[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(WALKS).objectStore(WALKS).getAll();
    request.onsuccess = () => resolve((request.result as MotionWalk[]).filter(walk =>
      walk?.source === 'device-motion' && walk.owner === owner && typeof walk.id === 'string' &&
      Number.isSafeInteger(walk.steps) && walk.steps > 0 &&
      validTime(walk.startedAt) && validTime(walk.lastStepAt)
    ).sort((a, b) => b.startedAt - a.startedAt));
    request.onerror = () => reject(request.error);
  });
}

// Only used to retry a previously measured, interrupted write. Session IDs are
// unique and absolute snapshots make a retry idempotent.
export function retryMotionWalk(db: IDBDatabase, walk: MotionWalk): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WALKS, 'readwrite');
    const store = tx.objectStore(WALKS);
    const existing = store.get(walk.id);
    existing.onsuccess = () => {
      if (!existing.result || existing.result.steps < walk.steps) store.put(walk);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('diary-write-failed'));
  });
}

// IDB serializes these transactions across windows, including on Safari.
// A crashed recorder expires. A delayed write from that window cannot overwrite
// the next walk, and retrying a checkpoint writes the same absolute step count.
export function updateRecorder(db: IDBDatabase, owner: string, action: 'claim' | 'renew' | 'release', walk?: MotionWalk): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(walk ? [RECORDER, WALKS] : [RECORDER], 'readwrite');
    const recorder = tx.objectStore(RECORDER);
    const request = recorder.get('active');
    let accepted = false;
    request.onsuccess = () => {
      const lease = request.result as { owner: string; expiresAt: number } | undefined;
      const now = Date.now();
      accepted = lease?.owner === owner || (action === 'claim' && (!lease || lease.expiresAt <= now));
      if (!accepted) return;
      if (action === 'release') recorder.delete('active');
      else recorder.put({ owner, expiresAt: now + LEASE_MS }, 'active');
      if (walk) tx.objectStore(WALKS).put(walk);
    };
    tx.oncomplete = () => resolve(accepted);
    tx.onabort = () => reject(tx.error ?? new Error('diary-write-failed'));
  });
}
