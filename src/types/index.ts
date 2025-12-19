export type Group = 'Vendas salão' | 'Fiados salão' | 'Fiados rua' | 'Vendas rua';

export interface Item {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  group: Group;
  timestamp: string; // ISO string for date
}
