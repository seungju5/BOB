import { MotionStepDetector, type MotionSample } from './motion-detector';
import { listenToMotion, requestMotionAccess } from './motion-input';
import { openMotionDiary, readMotionWalks, retryMotionWalk, updateRecorder, type MotionWalk } from './motion-diary';

export type WalkPhase = 'idle' | 'permission' | 'waiting' | 'measuring' | 'quiet' | 'finishing' | 'finished' |
  'hidden' | 'no-signal' | 'denied' | 'unsupported' | 'occupied' | 'storage-error';
export type WalkScreen = {
  phase: WalkPhase;
  steps: number | null;
  history: 'loading' | 'ready' | 'error';
  walks: MotionWalk[];
  pendingSave: boolean;
};
export const initialWalkScreen: WalkScreen = { phase: 'idle', steps: null, history: 'loading', walks: [], pendingSave: false };

type Recording = {
  db: IDBDatabase;
  walk: MotionWalk;
  detector: MotionStepDetector;
  lastSignal: number;
  sampled: boolean;
  timer: number;
  pending: Promise<void>;
  stopInput?: () => void;
  wake?: WakeLockSentinel;
};

export class BrowserWalkSession {
  private screen = initialWalkScreen;
  private connection?: Promise<IDBDatabase>;
  private run?: Recording;
  private revision = 0;
  private disposed = false;
  private unsaved?: MotionWalk;

  constructor(private readonly render: (screen: WalkScreen) => void) {
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.hide);
    window.addEventListener('pageshow', this.refresh);
    void this.refresh();
  }

  private show(change: Partial<WalkScreen>) {
    if (this.disposed) return;
    this.screen = { ...this.screen, ...change };
    this.render(this.screen);
  }

  private database() {
    this.connection ??= openMotionDiary().catch(error => { this.connection = undefined; throw error; });
    return this.connection;
  }

  refresh = async () => {
    try { this.show({ walks: await readMotionWalks(await this.database()), history: 'ready' }); }
    catch { this.show({ history: 'error' }); }
  };

  private visibility = () => { if (document.hidden) this.hide(); else void this.refresh(); };
  private hide = () => { if (this.run || this.screen.phase === 'permission') this.stop('hidden'); };

  async start() {
    if (this.disposed || this.unsaved || this.run || this.screen.phase === 'permission' || this.screen.phase === 'finishing') return;
    const revision = ++this.revision;
    this.show({ phase: 'permission', steps: null });
    const access = await requestMotionAccess();
    if (revision !== this.revision) return;
    if (access !== 'granted') { this.show({ phase: access }); return; }
    try {
      const db = await this.database();
      if (revision !== this.revision) return;
      const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
      const claimed = await updateRecorder(db, id, 'claim');
      if (revision !== this.revision || document.hidden) {
        if (claimed) await updateRecorder(db, id, 'release');
        if (revision === this.revision) this.show({ phase: 'hidden' });
        return;
      }
      if (!claimed) { this.show({ phase: 'occupied' }); return; }
      const now = Date.now();
      const run: Recording = { db, walk: { id, source: 'device-motion', startedAt: now, lastStepAt: now, steps: 0 },
        detector: new MotionStepDetector(), lastSignal: performance.now(), sampled: false, timer: 0, pending: Promise.resolve() };
      this.run = run;
      this.show({ phase: 'waiting' });
      run.timer = window.setInterval(() => {
        if (document.hidden) { this.stop('hidden'); return; }
        const silence = performance.now() - run.lastSignal;
        if (!run.sampled && silence > 15_000) { this.stop('no-signal'); return; }
        if (run.sampled && silence > 8_000 && this.screen.phase !== 'quiet') this.show({ phase: 'quiet' });
        void updateRecorder(db, id, 'renew').then(held => {
          if (!held && this.run === run) this.stop('occupied');
        }).catch(() => { if (this.run === run) this.stop('storage-error'); });
      }, 3000);
      const stopInput = listenToMotion(this.motion, () => { if (this.run === run) this.stop('denied'); });
      if (this.run !== run) { stopInput(); return; }
      run.stopInput = stopInput;
      if (navigator.wakeLock) void navigator.wakeLock.request('screen').then(lock => {
        if (this.run === run) run.wake = lock;
        else void lock.release().catch(() => {});
      }).catch(() => { /* Foreground measurement also works without a wake lock. */ });
    } catch {
      if (revision === this.revision) this.stop('storage-error');
    }
  }

  private motion = (time: number, sample: MotionSample) => {
    const run = this.run;
    if (!run || document.hidden) return;
    run.lastSignal = performance.now();
    if (!run.sampled) { run.sampled = true; this.show({ phase: 'measuring', steps: 0 }); }
    else if (this.screen.phase === 'quiet') this.show({ phase: 'measuring' });
    const steps = run.detector.sample(time, sample);
    if (!steps) return;
    const walk = { ...run.walk, steps: run.walk.steps + steps, lastStepAt: Date.now() };
    run.walk = walk;
    // Queue the IDB transaction immediately. Screen counts follow the commit,
    // and pagehide/reload can only leave the last committed checkpoint.
    run.pending = updateRecorder(run.db, walk.id, 'renew', walk).then(held => {
      if (!held) { if (this.run === run) this.stop('occupied'); return; }
      if (this.run === run || this.screen.phase === 'finishing') this.show({ steps: walk.steps });
    }).catch(() => {
      this.unsaved = run.walk;
      this.show({ pendingSave: true, phase: 'storage-error' });
      if (this.run === run) this.stop('storage-error');
    });
  };

  stop(phase: WalkPhase = 'finished') {
    const revision = ++this.revision;
    const run = this.run;
    this.run = undefined;
    if (!run) { this.show({ phase }); return; }
    run.stopInput?.();
    window.clearInterval(run.timer);
    void run.wake?.release().catch(() => {});
    this.show({ phase: 'finishing' });
    // Earlier checkpoints are already enqueued on the same recorder store.
    void updateRecorder(run.db, run.walk.id, 'release').catch(() => {});
    void run.pending.then(async () => {
      if (this.disposed || revision !== this.revision) return;
      this.show({ phase: this.unsaved ? 'storage-error' : phase });
      await this.refresh();
    });
  }

  async retrySave() {
    const walk = this.unsaved;
    if (!walk || this.screen.phase === 'finishing') return;
    this.show({ phase: 'finishing' });
    try {
      await retryMotionWalk(await this.database(), walk);
      this.unsaved = undefined;
      this.show({ phase: 'finished', steps: walk.steps, pendingSave: false });
      await this.refresh();
    } catch { this.show({ phase: 'storage-error' }); }
  }

  dispose() {
    this.disposed = true;
    this.stop('hidden');
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.hide);
    window.removeEventListener('pageshow', this.refresh);
    void this.connection?.then(db => db.close()).catch(() => {});
  }
}
