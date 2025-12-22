
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
  originalCommand?: string; // The raw string used to create the item
  
  // To store details for complex entries
  individualPrices?: number[]; // For KG items
  predefinedItems?: PredefinedItem[]; // For items like M, P, G etc.
  bomboniereItems?: SelectedBomboniereItem[];

  // For favorite client entries
  customerName?: string;
  customerId?: string; // ID from FavoriteClient
}

export interface ClientAccountEntry {
    id: string;
    customerId: string;
    customerName: string;
    description: string;
    price: number;
    timestamp: string;
}

export interface FavoriteClient {
  id: string;
  name: string;
  command: string;
}


export interface DailyReport {
  id: string; // YYYY-MM-DD
  timestamp: string;
  reportData: {
    totalFaturamento: number;
    totalAVista: number;
    totalFiado: number;
    totalSalao: number;
    totalRua: number;
    deliveryCount: number;
    totalDeliveryFee: number;
    totalMealItems: number;
    totalBomboniereValue: number;
    totalBomboniereQuantity: number;
    totalsByGroup: Record<Group, number>;
    itemCounts: Record<string, { total: number; rua: number; salao: number }>;
    bomboniereItemCounts: Record<string, { quantity: number; total: number; rua: number; salao: number }>;
    totalMealValue: number;
  };
  rawItems: Item[];
}
