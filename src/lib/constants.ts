
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
      "price": 5,
      "stock": 100
    },
    {
      "id": "fanta-lata",
      "name": "Fanta Lata",
      "price": 5,
      "stock": 100
    },
    {
      "id": "guarana-lata",
      "name": "Guaraná Lata",
      "price": 5,
      "stock": 100
    },
    {
      "id": "coca-2l",
      "name": "Coca-cola 2L",
      "price": 12,
      "stock": 100
    },
    {
      "id": "guarana-2l",
      "name": "Guaraná 2L",
      "price": 10,
      "stock": 100
    },
    {
      "id": "agua-sem-gas",
      "name": "Água sem Gás",
      "price": 3,
      "stock": 100
    },
    {
      "id": "agua-com-gas",
      "name": "Água com Gás",
      "price": 3.5,
      "stock": 100
    },
    {
      "id": "chocolate",
      "name": "Chocolate",
      "price": 4,
      "stock": 100
    },
    {
      "id": "bala",
      "name": "Balas",
      "price": 0.5,
      "stock": 100
    },
    {
      "id": "chiclete",
      "name": "Chiclete",
      "price": 1,
      "stock": 100
    },
    {
      "id": "coca-lata-zero",
      "name": "Coca Lata Zero",
      "price": 5,
      "stock": 100
    },
    {
      "id": "coca-600",
      "name": "Coca 600",
      "price": 8,
      "stock": 100
    },
    {
      "id": "coca-zero-600",
      "name": "Coca Zero 600",
      "price": 8,
      "stock": 100
    },
    {
      "id": "coquinha-200ml",
      "name": "Coquinha 200ml",
      "price": 3,
      "stock": 100
    },
    {
      "id": "coquinha-200ml-zero",
      "name": "Coquinha 200ml Zero",
      "price": 3,
      "stock": 100
    }
  ];
