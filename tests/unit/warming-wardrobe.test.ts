import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DressedRabbit } from '@/components/walking/DressedRabbit';
import { resolve } from 'node:path';
import { createHeartsDemo } from '@/lib/hearts/demo';
import { HEART_ITEMS } from '@/packages/walking-hearts/core.mjs';
import { applyHeartOutfit, changedParts, heartOutfitPlan, readLocalLook, STARTER_ITEMS, STARTER_LOOK } from '@/lib/walking/wardrobe';

const now = new Date('2026-11-24T05:00:00Z');

describe('워밍이 산책 옷장', () => {
  it('provides an inventory picture and the equipped artwork for every public and heart item', () => {
    expect(existsSync(resolve('public/brand/bunny.png'))).toBe(true);
    const names = ['trail-park', 'item-park'];
    for (const item of [...STARTER_ITEMS, ...HEART_ITEMS]) {
      names.push('item-' + item.id);
      if (item.category === 'background') names.push('trail-' + item.id);
    }
    for (const name of names) expect(existsSync(resolve('public/walking/wardrobe', name + '.webp')), name).toBe(true);
  });
  it('wears each catalog item on one body with the chin or paw in front of the matching accessory', () => {
    const render = (body: string, hat: string | null, accessory: string | null) =>
      renderToStaticMarkup(createElement(DressedRabbit, { body, hat, accessory, asset: name => '/' + name + '.webp', label: '워밍이' }));
    for (const item of [...STARTER_ITEMS, ...HEART_ITEMS]) {
      if (item.category === 'background') continue;
      const html = render(item.category === 'outfit' ? item.id : 'base',
        item.category === 'hat' ? item.id : null, item.category === 'accessory' ? item.id : null);
      expect(html, item.id).toContain('/item-' + item.id + '.webp');
      expect(html.match(/href="[^"]*\/brand\/bunny\.png"/g), item.id).toHaveLength(1);
    }
    for (const [accessory, foreground] of [['scarf', 'chin'], ['basket', 'grip'], ['rice-pouch', 'grip']]) {
      const html = render('vest', 'straw-hat', accessory);
      const sprite = html.indexOf('/item-' + accessory);
      const cover = sprite + html.slice(sprite).search(new RegExp('<use[^>]+clip-path="url\\(#[^"]+-' + foreground));
      expect(cover, accessory).toBeGreaterThan(sprite);
      expect(html.indexOf('/item-straw-hat')).toBeGreaterThan(cover);
    }
  });

  it('tucks both ears on every body only when a closed hat is worn', () => {
    const bodies = ['base', ...[...STARTER_ITEMS, ...HEART_ITEMS].filter(item => item.category === 'outfit').map(item => item.id)];
    for (const body of bodies) {
      for (const hat of ['berry-beret', 'straw-hat', 'hiking-cap', 'rose-bow', 'crown', null]) {
        const html = renderToStaticMarkup(createElement(DressedRabbit, {
          body, hat, accessory: 'scarf', asset: name => '/' + name + '.webp', label: '워밍이',
        }));
        const bodyImage = html.match(/<image[^>]+id="[^"]+-body"[^>]*>/)?.[0];
        expect(bodyImage, body).toContain('/brand/bunny.png');
        const closed = hat === 'berry-beret' || hat === 'straw-hat' || hat === 'hiking-cap';
        expect(bodyImage?.includes('-tucked)'), body + '/' + hat).toBe(closed);
        if (closed) expect(html).not.toMatch(/<use[^>]*-ears\)/);
      }
    }
  });

  it('restores only free cosmetics from the matching categories and preserves explicit removals', () => {
    const result = readLocalLook(JSON.stringify({
      hat: 'rice-pouch', outfit: null, accessory: 'rice-pouch', background: 'autumn', count: 3000, balance: 20,
    }));
    expect(result).toEqual({ ...STARTER_LOOK, outfit: null, accessory: 'rice-pouch' });
    for (const unusable of [null, 'null', 'not json', '12']) expect(readLocalLook(unusable)).toEqual(STARTER_LOOK);
  });

  it('restores the trail reward after collecting all stamps, independent of the heart wallet', () => {
    const stored = JSON.stringify({outfit: 'star-cape', hat: 'straw-hat', background: 'moon'});
    expect(readLocalLook(stored)).toEqual({...STARTER_LOOK, background: 'moon'});
    expect(readLocalLook(stored, true)).toEqual({...STARTER_LOOK, outfit: 'star-cape', background: 'moon'});
  });

  it('selects several parts without persisting a stale change over another tab', () => {
    const edited = { hat: 'rose-bow', outfit: null, background: 'moon' } as const;
    const otherTab = { ...STARTER_LOOK, outfit: 'dungarees' as const, accessory: 'rice-pouch' as const, background: 'moon' as const };
    const changes = changedParts(otherTab, edited);
    expect(changes).toEqual({ hat: 'rose-bow', outfit: null });
    expect({ ...otherTab, ...changes }).toEqual({ ...otherTab, hat: 'rose-bow', outfit: null });
  });

  it('buys and equips a complete heart outfit once and preserves old owned items on removal', () => {
    const original = createHeartsDemo(now).state;
    const outfit = { hat: 'straw-hat', accessory: 'basket' } as const;
    const result = applyHeartOutfit(original, outfit);
    expect(result.balance).toBe(original.balance - 9);
    expect(result.equipped).toMatchObject(outfit);
    expect(result.owned).toEqual(expect.arrayContaining(['basket', 'straw-hat']));
    expect(applyHeartOutfit(result, outfit)).toBe(result);
    const removed = applyHeartOutfit(result, { hat: null });
    expect(removed.equipped).toMatchObject({ hat: null, accessory: 'basket' });
    expect(removed.owned).toEqual(result.owned);
    expect(applyHeartOutfit(removed, { hat: 'straw-hat' }).balance).toBe(result.balance);
  });

  it('preflights the total and rejects wrong-category or local-only items before any debit', () => {
    const original = createHeartsDemo(now).state;
    const before = structuredClone(original);
    expect(() => applyHeartOutfit(original, { hat: 'straw-hat', outfit: 'vest' })).toThrow('insufficient_hearts');
    expect(() => heartOutfitPlan(original, { hat: 'scarf' })).toThrow('invalid_item');
    expect(() => heartOutfitPlan(original, { outfit: 'raincoat' })).toThrow('invalid_item');
    expect(original).toEqual(before);
  });
});
