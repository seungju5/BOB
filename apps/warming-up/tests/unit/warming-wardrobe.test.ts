import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHeartsDemo } from '@/lib/hearts/demo';
import { HEART_ITEMS } from '@/packages/walking-hearts/core.mjs';
import { applyHeartOutfit, changedParts, heartOutfitPlan, readLocalLook, STARTER_ITEMS, STARTER_LOOK } from '@/lib/walking/wardrobe';

const now = new Date('2026-11-24T05:00:00Z');

describe('워밍이 산책 옷장', () => {
  it('provides an inventory picture and the equipped artwork for every public and heart item', () => {
    const names = ['body-base', 'trail-park', 'item-park'];
    for (const item of [...STARTER_ITEMS, ...HEART_ITEMS]) {
      names.push('item-' + item.id);
      if (item.category === 'outfit') names.push('body-' + item.id);
      if (item.category === 'background') names.push('trail-' + item.id);
    }
    for (const name of names) expect(existsSync(resolve('public/walking/wardrobe', name + '.webp')), name).toBe(true);
  });
  it('restores only free cosmetics from the matching categories and preserves explicit removals', () => {
    const result = readLocalLook(JSON.stringify({
      hat: 'rice-pouch', outfit: null, accessory: 'rice-pouch', background: 'autumn', count: 3000, balance: 20,
    }));
    expect(result).toEqual({ ...STARTER_LOOK, outfit: null, accessory: 'rice-pouch' });
    for (const unusable of [null, 'null', 'not json', '12']) expect(readLocalLook(unusable)).toEqual(STARTER_LOOK);
  });

  it('selects several parts without persisting a stale change over another tab', () => {
    const edited = { hat: 'rose-bow', outfit: null, background: 'moon' } as const;
    const otherTab = { ...STARTER_LOOK, accessory: 'rice-pouch' as const, background: 'moon' as const };
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
