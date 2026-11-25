// Static imports emit the shared wardrobe art with this app's own Next build.
import bodyBase from '@/apps/warming-up/public/walking/wardrobe/body-base.webp';
import bodyVest from '@/apps/warming-up/public/walking/wardrobe/body-vest.webp';
import bodyHanbok from '@/apps/warming-up/public/walking/wardrobe/body-hanbok.webp';
import bodyStarCape from '@/apps/warming-up/public/walking/wardrobe/body-star-cape.webp';
import itemStrawHat from '@/apps/warming-up/public/walking/wardrobe/item-straw-hat.webp';
import itemHikingCap from '@/apps/warming-up/public/walking/wardrobe/item-hiking-cap.webp';
import itemCrown from '@/apps/warming-up/public/walking/wardrobe/item-crown.webp';
import itemScarf from '@/apps/warming-up/public/walking/wardrobe/item-scarf.webp';
import itemBasket from '@/apps/warming-up/public/walking/wardrobe/item-basket.webp';

const sprites: Record<string, string> = {
  'body-base': bodyBase.src,
  'body-vest': bodyVest.src,
  'body-hanbok': bodyHanbok.src,
  'body-star-cape': bodyStarCape.src,
  'item-straw-hat': itemStrawHat.src,
  'item-hiking-cap': itemHikingCap.src,
  'item-crown': itemCrown.src,
  'item-scarf': itemScarf.src,
  'item-basket': itemBasket.src,
};

export const heartRabbitSprite = (name: string) => sprites[name];
