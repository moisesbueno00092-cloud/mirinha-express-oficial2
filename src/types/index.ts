

export type Group = 'Vendas salão' | 'Fiados salão' | 'Fiados rua' | 'Vendas rua';

export interface PredefinedItem {
  name: string;
  price: number;
}

export interface BomboniereItem {
    id: string;
    name: string;
    price: number;
    estoque: number;
}

export interface SelectedBomboniereItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Item {
  id: string;
  userId: string;
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

export interface FavoriteClient {
  id: string;
  userId: string;
  name: string;
  command: string;
}

export type ItemCount = { [itemName: string]: number };

export interface DailyReport {
  id?: string;
  userId: string;
  reportDate: string; // YYYY-MM-DD
  createdAt: string; // ISO String

  // Main financial summary
  totalGeral: number;
  totalAVista: number;
  totalFiado: number;
  
  // Detailed financial breakdown
  totalVendasSalao: number;
  totalVendasRua: number;
  totalFiadoSalao: number;
  totalFiadoRua: number;

  // Other financial data
  totalKg: number;
  totalTaxas: number;
  totalBomboniereSalao: number;
  totalBomboniereRua: number;
  
  // Item/Order counts
  totalItens: number;
  totalPedidos: number;
  totalEntregas: number;
  totalItensRua: number;

  // Detailed counts
  contagemTotal: ItemCount;
  contagemRua: ItemCount;

  // Raw items for the day
  items: Item[];
}

// Admin Section Types

export interface Fornecedor {
  id: string;
  nome: string;
  color: string;
}

export interface ContaAPagar {
  id: string;
  fornecedorId: string;
  descricao: string;
  valor: number;
  dataVencimento: string; // YYYY-MM-DD
  estaPaga: boolean;
}

export interface EntradaMercadoria {
  id: string;
  produtoNome: string;
  fornecedorId: string;
  data: string; // ISO string
  quantidade: number;
  precoUnitario: number;
  valorTotal: number;
}

export interface Funcionario {
    id: string;
    nome: string;
    cargo: string;
    dataAdmissao: string; // YYYY-MM-DD
    status: 'Ativo' | 'Inativo';
    salarioBase: number;
}

export interface FuncionarioLancamentoFinanceiro {
    id: string;
    funcionarioId: string;
    tipo: 'vale' | 'bonus' | 'desconto' | 'hora_extra' | 'comissao' | 'falta';
    valor: number; // O valor monetário final do lançamento
    data: string; // ISO string
    descricao?: string;
    quantidade?: number; // Para armazenar horas ou dias
}

export interface VerbasRescisorias {
    saldoSalario: number;
    avisoPrevio: number;
    feriasVencidas: number;
    feriasProporcionais: number;
    tercoFerias: number;
    decimoTerceiroProporcional: number;
    total: number;
}

export interface FuncionarioHolerite {
    id: string;
    funcionarioId: string;
    mes: number; // 0-11
    ano: number;
    dataFechamento: string; // ISO string
    salarioBase: number;
    totalVencimentos: number;
    totalDescontos: number;
    valorLiquido: number;
    lancamentos: FuncionarioLancamentoFinanceiro[];
}

// AI Related types
export interface ParsedRomaneioItem {
  produtoNome: string;
  quantidade: number;
  valorTotal: number;
}

export interface FavoriteClientEntry {
  id: string;
  favoriteClientId: string;
  orderItemId: string;
  userId: string;
  timestamp: string; // ISO string
  total: number;
  estaPago: boolean;
}
    

    