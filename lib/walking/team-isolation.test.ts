import {afterEach, describe, expect, it, vi} from 'vitest';
import {connectFirebase} from '@/lib/firebase/bridge';
import {readSmartThingsConnection} from '@/lib/firebase/smartthings';
import {createHeartsClient} from '@/lib/hearts/client';
import {createWalkingClient} from './client';

vi.mock('@/lib/firebase/bridge', () => ({connectFirebase: vi.fn(), within: <T>(value: T) => value}));

describe('new project before device services are connected', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('starts a new household without a device or a received signal', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await readSmartThingsConnection('fixture-owner')).toEqual({stage: 'disconnected'});
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stops walking and family-sharing requests before acquiring an ID token', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const walking = createWalkingClient();
    const hearts = createHeartsClient('fixture-owner');
    await expect(walking.profile('fixture-owner')).rejects.toMatchObject({code: 'setup_required'});
    await expect(walking.join('fixture-owner', '테스트')).rejects.toMatchObject({code: 'setup_required'});
    await expect(hearts.request('hearts')).rejects.toMatchObject({code: 'setup_required'});
    await expect(hearts.request('heartmessage', {text: '테스트'})).rejects.toMatchObject({code: 'setup_required'});
    expect(connectFirebase).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
