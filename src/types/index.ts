export type Group = 'Vendas salão' | 'Fiados salão' | 'Fiados rua' | 'Vendas rua';

export interface PredefinedItem {
  name: string;
  price: number;
}

export interface BomboniereItem {
    id: string;
    name: string;
    price: number;
    stock: number;
}

export interface SelectedBomboniereItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Item {
  id: string;
  name: string; // e.g., 'M P', 'KG', 'Lançamento Misto'
  quantity: number; // total count of individual items
  price: number; // For single items, this is the price. For grouped KG items, this is the SUM of individualPrices.
  deliveryFee: number;
  total: number; // price + deliveryFee
  group: Group;
  timestamp: string; // ISO string for date
  
  // To store details for complex entries
  individualPrices?: number[]; // For KG items
  predefinedItems?: PredefinedItem[]; // For items like M, P, G etc.
  bomboniereItems?: SelectedBomboniereItem[];
}


export interface DailyReport {
  id: string; // YYYY-MM-DD
  timestamp: string;
  reportData: {
    totalFaturamento: number;
    totalAVista: number;
    totalFiado: number;
    deliveryCount: number;
    totalDeliveryFee: number;
    totalMealItems: number;
    totalBomboniereValue: number;
    totalBomboniereQuantity: number;
    totalsByGroup: Record<Group, number>;
    itemCounts: [string, { total: number; rua: number }][];
    bomboniereItemCounts: [string, { quantity: number; total: number }][];
    totalMealValue: number;
  };
  rawItems: Item[];
}

    