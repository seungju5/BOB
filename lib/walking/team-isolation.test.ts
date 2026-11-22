import {afterEach, describe, expect, it, vi} from 'vitest';
import {connectFirebase} from '@/lib/firebase/bridge';
import {readSmartThingsConnection} from '@/lib/firebase/smartthings';
import {createHeartsClient} from '@/lib/hearts/client';
import {createWalkingClient} from './client';
import readiness from '../../public/service-status/smartthings.json';

vi.mock('@/lib/firebase/bridge', () => ({connectFirebase: vi.fn(), within: <T>(value: T) => value}));

describe('new project before device services are connected', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('reads only public team readiness before device connections are offered', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(readiness));
    vi.stubGlobal('fetch', fetcher);
    expect(await readSmartThingsConnection('fixture-owner')).toEqual({stage: 'setup_required'});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/smartthings/config', expect.objectContaining({method: 'GET'}));
    expect(connectFirebase).not.toHaveBeenCalled();
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
