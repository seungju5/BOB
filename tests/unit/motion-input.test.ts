import { afterEach, expect, it, vi } from 'vitest';
import { listenToMotion, requestMotionAccess } from '@/lib/walking/motion-input';

afterEach(() => vi.unstubAllGlobals());

it('asks for iPhone motion access on the tap and preserves denial', async () => {
  const ask = vi.fn().mockResolvedValue('denied');
  vi.stubGlobal('window', { isSecureContext: true, DeviceMotionEvent: { requestPermission: ask } });
  const pending = requestMotionAccess();
  expect(ask).toHaveBeenCalledOnce();
  await expect(pending).resolves.toBe('denied');
  vi.stubGlobal('window', { isSecureContext: false, DeviceMotionEvent: { requestPermission: ask } });
  await expect(requestMotionAccess()).resolves.toBe('unsupported');
  expect(ask).toHaveBeenCalledTimes(1);
});

it('consumes browser motion events and detaches on finish', () => {
  const add = vi.fn(), remove = vi.fn(), receive = vi.fn();
  vi.stubGlobal('window', { DeviceMotionEvent: {}, addEventListener: add, removeEventListener: remove });
  const stop = listenToMotion(receive, vi.fn());
  const [name, handle] = add.mock.calls[0];
  expect(name).toBe('devicemotion');
  const motion = { timeStamp: 123, acceleration: null, accelerationIncludingGravity: { x:0, y:0, z:9.81 } };
  handle({ ...motion, isTrusted:false });
  handle({ ...motion, isTrusted:true, accelerationIncludingGravity:null });
  expect(receive).not.toHaveBeenCalled();
  handle({ ...motion, isTrusted:true });
  expect(receive).toHaveBeenCalledWith(123, { kind:'gravity', x:0, y:0, z:9.81 });
  stop();
  expect(remove).toHaveBeenCalledWith('devicemotion', handle);
  handle({ ...motion, isTrusted:true });
  expect(receive).toHaveBeenCalledTimes(1);
});

it('uses only the accelerometer on supported devices and respects a denied permission', async () => {
  const denied = vi.fn(), receive = vi.fn(), add = vi.fn(), start = vi.fn(), stopSensor = vi.fn();
  const sensor = { x:0, y:10, z:0, timestamp:200, start, stop:stopSensor, onreading:null, onerror:null };
  vi.stubGlobal('window', { isSecureContext:true, DeviceMotionEvent:{}, Accelerometer:class { constructor() { return sensor; } }, addEventListener:add, removeEventListener:vi.fn() });
  await expect(requestMotionAccess()).resolves.toBe('granted');
  const stop = listenToMotion(receive, denied);
  expect(start).toHaveBeenCalledOnce();
  const active = sensor as unknown as { onreading: (event: object) => void; onerror: (event: object) => void };
  active.onreading({isTrusted:true});
  expect(receive).toHaveBeenCalledWith(200, {kind:'gravity', x:0, y:10, z:0});
  active.onerror({error:new DOMException('Permission denied', 'NotAllowedError')});
  expect(denied).toHaveBeenCalledOnce();
  expect(add).not.toHaveBeenCalled();
  stop();
  expect(stopSensor).toHaveBeenCalledOnce();
});
