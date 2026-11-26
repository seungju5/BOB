import { readMotion, type MotionSample } from './motion-detector';

type WebAccelerometer = {
  x: number | null; y: number | null; z: number | null; timestamp: number | null;
  onreading: ((event: Event) => void) | null;
  onerror: ((event: { error: DOMException }) => void) | null;
  start(): void; stop(): void;
};
type SensorWindow = Window & {
  DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
  Accelerometer?: new (options: { frequency: number }) => WebAccelerometer;
};

export async function requestMotionAccess(): Promise<'granted' | 'denied' | 'unsupported'> {
  const { DeviceMotionEvent: motion, Accelerometer } = window as SensorWindow;
  if (!window.isSecureContext || (!motion && !Accelerometer)) return 'unsupported';
  try {
    // Call on the original button gesture, before any storage operation.
    return motion?.requestPermission && await motion.requestPermission() !== 'granted' ? 'denied' : 'granted';
  } catch { return 'denied'; }
}

export function listenToMotion(receive: (time: number, sample: MotionSample) => void, denied: () => void) {
  const target = window as SensorWindow;
  let sensor: WebAccelerometer | undefined;
  let closed = false;
  const motion = (event: DeviceMotionEvent) => {
    if (closed || !event.isTrusted) return;
    const sample = readMotion(event);
    if (sample) receive(event.timeStamp, sample);
  };
  function stopAccelerometer() {
    if (!sensor) return;
    sensor.onreading = sensor.onerror = null;
    sensor.stop();
    sensor = undefined;
  }
  function useMotionEvents() {
    stopAccelerometer();
    if (!closed && target.DeviceMotionEvent) window.addEventListener('devicemotion', motion);
  }
  function failure(reason: unknown) {
    if (closed) return;
    if (reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError')) denied();
    else useMotionEvents();
  }

  if (target.Accelerometer && !target.DeviceMotionEvent?.requestPermission) {
    // Chromium can supply acceleration without requesting the gyroscope.
    try {
      const device = sensor = new target.Accelerometer({ frequency: 50 });
      device.onreading = event => {
        if (closed || !event.isTrusted) return;
        const sample = readMotion({ accelerationIncludingGravity: device, acceleration: null });
        if (sample) receive(device.timestamp ?? event.timeStamp, sample);
      };
      device.onerror = event => failure(event.error);
      device.start();
    } catch (error) { failure(error); }
  } else useMotionEvents();
  return () => {
    closed = true;
    stopAccelerometer();
    window.removeEventListener('devicemotion', motion);
  };
}
