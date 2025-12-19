import { BomboniereItem } from '@/types';

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

export const BOMBONIERE_ITEMS_DEFAULT: BomboniereItem[] = [
    {
      "id": "coca-lata",
      "name": "Coca-cola Lata",
      "price": 5
    },
    {
      "id": "fanta-lata",
      "name": "Fanta Lata",
      "price": 5
    },
    {
      "id": "guarana-lata",
      "name": "Guaraná Lata",
      "price": 5
    },
    {
      "id": "coca-2l",
      "name": "Coca-cola 2L",
      "price": 12
    },
    {
      "id": "guarana-2l",
      "name": "Guaraná 2L",
      "price": 10
    },
    {
      "id": "agua-sem-gas",
      "name": "Água sem Gás",
      "price": 3
    },
    {
      "id": "agua-com-gas",
      "name": "Água com Gás",
      "price": 3.5
    },
    {
      "id": "chocolate",
      "name": "Chocolate",
      "price": 4
    },
    {
      "id": "bala",
      "name": "Balas",
      "price": 0.5
    },
    {
      "id": "chiclete",
      "name": "Chiclete",
      "price": 1
    }
  ];
