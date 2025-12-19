import { BomboniereItem } from '@/types';
import placeholderImages from './placeholder-images.json';

export const PREDEFINED_PRICES: { [key: string]: number } = {
  PP: 18.00,
  P: 20.00,
  M: 22.00,
  G: 24.00,
  GG: 26.00,
  KITM: 50.00,
  KITG: 60.00,
  PF: 28.00,
  SL: 5.00,
  SLKIT: 15.00,
  S: 42.90,
};

export const DELIVERY_FEE = 6.00;

export const BOMBONIERE_ITEMS_DEFAULT: BomboniereItem[] = placeholderImages.bomboniereItems.map(item => ({
    id: item.id,
    name: item.name,
    price: item.price,
    imageUrl: `https://picsum.photos/seed/${item.id}/200/200`,
    aiHint: item.aiHint,
}));
