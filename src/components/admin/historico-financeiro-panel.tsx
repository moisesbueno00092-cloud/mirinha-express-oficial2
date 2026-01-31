'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, isWithinInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, setYear, setMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ContaAPagar, Fornecedor, EntradaMercadoria, BomboniereItem } from '@/types';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Search, CalendarDays, TrendingUp, Trash2, Pencil, Save } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const findBestBomboniereMatch = (productName: string, bomboniereItems: BomboniereItem[]): BomboniereItem | undefined => {
    if (!productName || !bomboniereItems) return undefined;

    const lowerProductName = productName.toLowerCase();
    let bestMatch: BomboniereItem | undefined = undefined;
    let longestMatchLength = 0;

    for (const bomboniereItem of bomboniereItems) {
        // Normalize bomboniere name by removing content in parentheses
        const baseBomboniereName = bomboniereItem.name.toLowerCase().replace(/\s*\(.*\)\s*/, '').trim();

        if (!baseBomboniereName) continue;
        
        // Check if the invoice product name starts with the base bomboniere name
        if (lowerProductName.startsWith(baseBomboniereName)) {
            // We want the longest possible match to avoid "bala" matching "bala de goma" incorrectly.
            if (baseBomboniereName.length > longestMatchLength) {
                bestMatch = bomboniereItem;
                longestMatchLength = baseBomboniereName.length;
            }
        }
    }

    return bestMatch;
};


type ReportPeriod = 'month' | 'year';

const ExpenseReport = ({ contasPagas, fornecedorMap, period, year, month }: { contasPagas: ContaAPagar[], fornecedorMap: Map<string, Fornecedor>, period: ReportPeriod, year: number, month: string }) => {
    const aggregatedData = useMemo(() => {
        let referenceDate = new Date(year, parseInt(month), 1);

        const startDate = period === 'month' ? startOfMonth(referenceDate) : startOfYear(referenceDate);
        const endDate = period === 'month' ? endOfMonth(referenceDate) : endOfYear(referenceDate);
        
        const relevantContas = contasPagas.filter(c => {
             try {
                return isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startDate, end: endDate });
             } catch {
                return false;
             }
        });
        
        if (relevantContas.length === 0) {
            return { suppliers: [], totalExpenses: 0 };
        }

        const supplierMap = new Map<string, { count: number, totalValue: number }>();
        let totalExpenses = 0;

        for (const conta of relevantContas) {
            totalExpenses += conta.valor;
            const supplierId = conta.fornecedorId;
            
            const existing = supplierMap.get(supplierId) || { count: 0, totalValue: 0 };
            supplierMap.set(supplierId, {
                count: existing.count + 1,
                totalValue: existing.totalValue + conta.valor,
            });
        }
        
        const suppliers = Array.from(supplierMap.entries())
            .map(([supplierId, data]) => ({
                id: supplierId,
                name: fornecedorMap.get(supplierId)?.nome || 'Desconhecido',
                color: fornecedorMap.get(supplierId)?.color || '#ffffff',
                ...data
            }))
            .sort((a,b) => b.totalValue - a.totalValue);

        return { suppliers, totalExpenses };

    }, [contasPagas, fornecedorMap, period, year, month]);

    const periodLabel = period === 'month' ? `(${month !== 'all' ? format(setMonth(new Date(), parseInt(month)), 'MMMM', { locale: ptBR }) : 'Mês Atual'})` : `(${year})`;
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Relatórios de Despesas Pagas</CardTitle>
                    <CardDescription>Resumo de contas pagas por fornecedor no período.</CardDescription>
                  </div>
                  <div className="text-right">
                      <p className="text-xs text-muted-foreground">Despesa Total {periodLabel}</p>
                      <p className="text-2xl font-bold text-destructive">{formatCurrency(aggregatedData.totalExpenses)}</p>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
                {aggregatedData.suppliers.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma despesa paga encontrada para este período.</p>
                ) : (
                    <div className="rounded-md border max-h-[400px] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead>Nº de Contas</TableHead>
                                    <TableHead className="text-right">Valor Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {aggregatedData.suppliers.map(supplier => (
                                    <TableRow key={supplier.id}>
                                        <TableCell className="font-medium" style={{ color: supplier.color }}>{supplier.name}</TableCell>
                                        <TableCell>{supplier.count}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(supplier.totalValue)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

const ComprasReport = ({ allEntradas, period, year, month }: { allEntradas: EntradaMercadoria[], period: ReportPeriod, year: number, month: string }) => {
    const aggregatedData = useMemo(() => {
        let referenceDate = new Date(year, parseInt(month), 1);

        const startDate = period === 'month' ? startOfMonth(referenceDate) : startOfYear(referenceDate);
        const endDate = period === 'month' ? endOfMonth(referenceDate) : endOfYear(referenceDate);

        const relevantEntradas = allEntradas.filter(e => {
            try {
                return isWithinInterval(parseISO(e.data), { start: startDate, end: endDate });
            } catch {
                return false;
            }
        });
        
        if (relevantEntradas.length === 0) {
            return { products: [], totalValue: 0 };
        }

        const productMap = new Map<string, { totalQuantity: number, totalValue: number }>();
        let totalValue = 0;

        for (const entrada of relevantEntradas) {
            totalValue += entrada.valorTotal;
            const productName = entrada.produtoNome;
            
            const existing = productMap.get(productName) || { totalQuantity: 0, totalValue: 0 };
            productMap.set(productName, {
                totalQuantity: existing.totalQuantity + entrada.quantidade,
                totalValue: existing.totalValue + entrada.valorTotal,
            });
        }
        
        const products = Array.from(productMap.entries())
            .map(([productName, data]) => ({
                name: productName,
                ...data
            }))
            .sort((a,b) => b.totalValue - a.totalValue);

        return { products, totalValue };

    }, [allEntradas, period, year, month]);

    const periodLabel = period === 'month' ? `(${month !== 'all' ? format(setMonth(new Date(), parseInt(month)), 'MMMM', { locale: ptBR }) : 'Mês Atual'})` : `(${year})`;
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Relatório de Compras de Mercadorias</CardTitle>
                    <CardDescription>Resumo de produtos comprados no período.</CardDescription>
                  </div>
                  <div className="text-right">
                      <p className="text-xs text-muted-foreground">Custo Total {periodLabel}</p>
                      <p className="text-2xl font-bold text-blue-500">{formatCurrency(aggregatedData.totalValue)}</p>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
                {aggregatedData.products.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma compra encontrada para este período.</p>
                ) : (
                    <div className="rounded-md border max-h-[400px] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Produto</TableHead>
                                    <TableHead>Quantidade Total</TableHead>
                                    <TableHead className="text-right">Valor Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {aggregatedData.products.map(product => (
                                    <TableRow key={product.name}>
                                        <TableCell className="font-medium">{product.name}</TableCell>
                                        <TableCell>{product.totalQuantity.toLocaleString('pt-BR')}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(product.totalValue)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

const DetailedExpensesTable = ({ entradas, fornecedorMap, onEditRequest, onDeleteRequest }: { 
    entradas: EntradaMercadoria[], 
    fornecedorMap: Map<string, Fornecedor>,
    onEditRequest: (entrada: EntradaMercadoria) => void,
    onDeleteRequest: (entrada: EntradaMercadoria) => void
}) => {
    if (entradas.length === 0) {
        return <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma despesa paga encontrada para este período.</p>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Detalhe de Entradas de Mercadorias (Pagas)</CardTitle>
                <CardDescription>Lista de todas as mercadorias e despesas pagas no período selecionado, ordenadas da mais recente para a mais antiga.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Produto</TableHead>
                                <TableHead>Fornecedor</TableHead>
                                <TableHead>Qtd.</TableHead>
                                <TableHead className="text-right">Preço Unit.</TableHead>
                                <TableHead className="text-right">Valor Total</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entradas.map((entry) => {
                                const fornecedor = fornecedorMap.get(entry.fornecedorId);
                                return (
                                    <TableRow key={entry.id}>
                                        <TableCell>{format(new Date(entry.data), 'dd/MM/yy HH:mm')}</TableCell>
                                        <TableCell className="font-medium">{entry.produtoNome}</TableCell>
                                        <TableCell style={{ color: fornecedor?.color || 'inherit' }}>
                                            {fornecedor?.nome || 'Desconhecido'}
                                        </TableCell>
                                        <TableCell>{entry.quantidade.toLocaleString('pt-BR')}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(entry.precoUnitario)}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(entry.valorTotal)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditRequest(entry)}>
                                                    <Pencil className="h-4 w-4 text-blue-500" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteRequest(entry)}>
                                                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};


const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 5; i--) {
        years.push(i);
    }
    return years;
}

const monthOptions = [
    { value: 'all', label: 'Mês Inteiro' },
    { value: '0', label: 'Janeiro' },
    { value: '1', label: 'Fevereiro' },
    { value: '2', label: 'Março' },
    { value: '3', label: 'Abril' },
    { value: '4', label: 'Maio' },
    { value: '5', label: 'Junho' },
    { value: '6', label: 'Julho' },
    { value: '7', label: 'Agosto' },
    { value: '8', label: 'Setembro' },
    { value: '9', label: 'Outubro' },
    { value: '10', label: 'Novembro' },
    { value: '11', label: 'Dezembro' },
];

export default function HistoricoFinanceiroPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('month');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));
    const [activeTab, setActiveTab] = useState('aggregated');
    const yearOptions = useMemo(() => generateYearOptions(), []);

    const [isProcessing, setIsProcessing] = useState(false);
    const [entradaToDelete, setEntradaToDelete] = useState<EntradaMercadoria | null>(null);
    const [entradaToEdit, setEntradaToEdit] = useState<EntradaMercadoria | null>(null);
    const [editedEntradaData, setEditedEntradaData] = useState<Partial<EntradaMercadoria>>({});
    const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);

    const contasQuery = useMemo(() => firestore ? query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc')) : null, [firestore]);
    const fornecedoresQuery = useMemo(() => firestore ? query(collection(firestore, 'fornecedores')) : null, [firestore]);
    const entradasQuery = useMemo(() => firestore ? query(collection(firestore, 'entradas_mercadorias'), orderBy('data', 'desc')) : null, [firestore]);
    const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);

    const { data: allContas, isLoading: isLoadingContas } = useCollection<ContaAPagar>(contasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const { data: allEntradas, isLoading: isLoadingEntradas } = useCollection<EntradaMercadoria>(entradasQuery);
    const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsQuery);

    const isLoading = isLoadingContas || isLoadingFornecedores || isLoadingEntradas || isLoadingBomboniere;

    useEffect(() => {
        if (entradaToEdit) {
            setEditedEntradaData(entradaToEdit);
        }
    }, [entradaToEdit]);

    const fornecedorMap = useMemo(() => {
        if (!fornecedores) return new Map<string, Fornecedor>();
        return new Map(fornecedores.map(f => [f.id, f]));
    }, [fornecedores]);

    const filteredEntradasBySearch = useMemo(() => {
        if (!allEntradas) return [];
        if (!searchQuery.trim()) return [];
        return allEntradas.filter(entrada => 
            entrada.produtoNome.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [allEntradas, searchQuery]);
    
    const { contasPagas, expenseSummary } = useMemo(() => {
        const referenceDate = new Date(selectedYear, parseInt(selectedMonth), 1);
        
        const startOfSelectedMonth = startOfMonth(referenceDate);
        const endOfSelectedMonth = endOfMonth(referenceDate);
        
        const startOfSelectedYear = startOfYear(referenceDate);
        const endOfSelectedYear = endOfYear(referenceDate);
        
        let monthTotal = 0;
        let yearTotal = 0;
        let pagas: ContaAPagar[] = [];

        if (!allContas) return { contasPagas: [], expenseSummary: { month: 0, year: 0 } };

        allContas.forEach(conta => {
            try {
                const dueDate = parseISO(conta.dataVencimento + 'T00:00:00');
                if (conta.estaPaga) {
                    pagas.push(conta);
                    if (isWithinInterval(dueDate, { start: startOfSelectedMonth, end: endOfSelectedMonth })) {
                        monthTotal += conta.valor;
                    }
                    if (isWithinInterval(dueDate, { start: startOfSelectedYear, end: endOfSelectedYear })) {
                        yearTotal += conta.valor;
                    }
                }
            } catch(e) {
                console.error("Invalid date for account:", conta);
            }
        });

        return { 
            contasPagas: pagas, 
            expenseSummary: { month: monthTotal, year: yearTotal },
        };

    }, [allContas, selectedYear, selectedMonth]);
    
    const filteredEntradasByPeriod = useMemo(() => {
        if (!allEntradas) return [];

        let referenceDate = new Date(selectedYear, parseInt(selectedMonth), 1);
        
        const startDate = reportPeriod === 'month' ? startOfMonth(referenceDate) : startOfYear(referenceDate);
        const endDate = reportPeriod === 'month' ? endOfMonth(referenceDate) : endOfYear(referenceDate);

        return allEntradas.filter(e => {
            if (e.estaPaga !== true) {
                return false;
            }
            try {
                return isWithinInterval(parseISO(e.data), { start: startDate, end: endDate });
            } catch {
                return false;
            }
        });
    }, [allEntradas, reportPeriod, selectedYear, selectedMonth]);

    const handleDeleteRequest = (entrada: EntradaMercadoria) => {
        setEntradaToDelete(entrada);
    };

    const handleEditRequest = (entrada: EntradaMercadoria) => {
        setEntradaToEdit(entrada);
    };

    const confirmDeleteEntrada = async () => {
        if (!firestore || !entradaToDelete || !bomboniereItems) return;
    
        setIsProcessing(true);
        
        try {
            const batch = writeBatch(firestore);
    
            const matchedItem = findBestBomboniereMatch(entradaToDelete.produtoNome, bomboniereItems);
            if (matchedItem) {
                const bomboniereDocRef = doc(firestore, 'bomboniere_items', matchedItem.id);
                const currentStock = bomboniereItems.find(bi => bi.id === matchedItem.id)?.estoque ?? 0;
                const newStock = currentStock - entradaToDelete.quantidade;
                batch.update(bomboniereDocRef, { estoque: newStock });
            }
    
            const entradaDocRef = doc(firestore, 'entradas_mercadorias', entradaToDelete.id);
            batch.delete(entradaDocRef);
    
            await batch.commit();
            
            toast({
                title: "Sucesso!",
                description: "A entrada de mercadoria foi excluída com sucesso.",
            });
    
        } catch (error: any) {
            console.error("Error deleting entrada mercadoria:", error);
            toast({
                variant: "destructive",
                title: "Erro ao Excluir",
                description: error.message || "Não foi possível remover a entrada.",
            });
        } finally {
            setEntradaToDelete(null);
            setIsProcessing(false);
        }
    };

    const handleEditDataChange = (field: keyof EntradaMercadoria, value: string) => {
        const newEditedData = { ...editedEntradaData, [field]: value };
    
        if (field === 'quantidade' || field === 'precoUnitario') {
            const qty = parseFloat(String(newEditedData.quantidade || '0').replace(',', '.'));
            const price = parseFloat(String(newEditedData.precoUnitario || '0').replace(',', '.'));
            if (!isNaN(qty) && !isNaN(price)) {
                newEditedData.valorTotal = qty * price;
            }
        }
        setEditedEntradaData(newEditedData);
    }
    
    const handleSaveEditRequest = () => {
        if (!editedEntradaData.produtoNome?.trim() || !(Number(editedEntradaData.valorTotal) >= 0)) {
            toast({
                variant: 'destructive',
                title: 'Dados Inválidos',
                description: 'O nome do produto não pode ser vazio e os valores numéricos devem ser válidos.',
            });
            return;
        }
        setEntradaToEdit(null); 
        setIsEditConfirmOpen(true);
    }

    const confirmSaveEdit = async () => {
        if (!firestore || !entradaToEdit || !editedEntradaData || !bomboniereItems) return;
    
        setIsProcessing(true);
        setIsEditConfirmOpen(false);
    
        try {
            const batch = writeBatch(firestore);
            const entradaDocRef = doc(firestore, 'entradas_mercadorias', entradaToEdit.id);
    
            const oldEntrada = entradaToEdit;
            const newEntrada: EntradaMercadoria = { ...oldEntrada, ...editedEntradaData as EntradaMercadoria };
            
            newEntrada.quantidade = Number(String(newEntrada.quantidade).replace(',', '.')) || 0;
            newEntrada.precoUnitario = Number(String(newEntrada.precoUnitario).replace(',', '.')) || 0;
            newEntrada.valorTotal = newEntrada.quantidade * newEntrada.precoUnitario;
    
            const oldMatched = findBestBomboniereMatch(oldEntrada.produtoNome, bomboniereItems);
            const newMatched = findBestBomboniereMatch(newEntrada.produtoNome, bomboniereItems);
    
            if (oldMatched && oldMatched.id !== newMatched?.id) {
                const bomboniereDocRef = doc(firestore, 'bomboniere_items', oldMatched.id);
                const currentStock = bomboniereItems.find(bi => bi.id === oldMatched.id)?.estoque ?? 0;
                batch.update(bomboniereDocRef, { estoque: currentStock - oldEntrada.quantidade });
            }
            if (newMatched) {
                const bomboniereDocRef = doc(firestore, 'bomboniere_items', newMatched.id);
                const currentStock = bomboniereItems.find(bi => bi.id === newMatched.id)?.estoque ?? 0;
                const quantityDiff = oldMatched?.id === newMatched.id ? (newEntrada.quantidade - oldEntrada.quantidade) : newEntrada.quantidade;
                batch.update(bomboniereDocRef, { estoque: currentStock + quantityDiff });
            }
    
            batch.update(entradaDocRef, {
                produtoNome: newEntrada.produtoNome,
                quantidade: newEntrada.quantidade,
                precoUnitario: newEntrada.precoUnitario,
                valorTotal: newEntrada.valorTotal,
            });
    
            await batch.commit();
            toast({ title: 'Sucesso', description: 'Entrada de mercadoria atualizada.' });
        } catch (error: any) {
            console.error("Error saving entrada", error);
            toast({ variant: 'destructive', title: 'Erro', description: error.message });
        } finally {
            setIsProcessing(false);
            setEditedEntradaData({});
        }
    }


    return (
        <div className="space-y-6">
            
             <AlertDialog open={!!entradaToDelete} onOpenChange={(open) => !open && setEntradaToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Entrada?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A entrada de "{entradaToDelete?.produtoNome}" será permanentemente removida. Se for um item de bomboniere, o estoque será revertido.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteEntrada} disabled={isProcessing}>
                            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Confirmar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Alteração?</AlertDialogTitle>
                        <AlertDialogDescription>
                           A alteração desta entrada <span className="font-bold">NÃO</span> irá atualizar os registos financeiros (Contas a Pagar) associados.
                           Esta ação serve apenas para correção de dados. A diferença de valores deverá ser gerida manualmente. Deseja continuar?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setEditedEntradaData({})}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmSaveEdit}>Sim, Continuar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={!!entradaToEdit} onOpenChange={(open) => !open && setEntradaToEdit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Entrada de Mercadoria</DialogTitle>
                        <DialogDescription>
                            Altere os detalhes do item registado. Lembre-se que isto não afeta as contas a pagar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="edit-product-name">Nome do Produto</Label>
                            <Input
                                id="edit-product-name"
                                value={editedEntradaData.produtoNome || ''}
                                onChange={(e) => handleEditDataChange('produtoNome', e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="edit-quantity">Quantidade</Label>
                                <Input
                                    id="edit-quantity"
                                    value={String(editedEntradaData.quantidade || '').replace('.', ',')}
                                    onChange={(e) => handleEditDataChange('quantidade', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="edit-unit-price">Preço Unitário (R$)</Label>
                                <Input
                                    id="edit-unit-price"
                                    value={String(editedEntradaData.precoUnitario || '').replace('.', ',')}
                                    onChange={(e) => handleEditDataChange('precoUnitario', e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-muted-foreground">Valor Total Calculado</p>
                            <p className="font-bold text-lg">{formatCurrency(editedEntradaData.valorTotal || 0)}</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                        <Button onClick={handleSaveEditRequest} disabled={isProcessing}>
                            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pagas Este Mês</CardTitle>
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">{formatCurrency(expenseSummary.month)}</div>}
                         <p className="text-xs text-muted-foreground">
                           em {format(setMonth(new Date(), parseInt(selectedMonth)), 'MMMM', { locale: ptBR })} de {selectedYear}
                         </p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pagas Este Ano</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">{formatCurrency(expenseSummary.year)}</div>}
                         <p className="text-xs text-muted-foreground">no ano de {selectedYear}</p>
                    </CardContent>
                </Card>
            </div>
            
            <div className="flex justify-between items-end gap-4">
                <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <div className='w-full space-y-1'>
                        <Label htmlFor="report-period" className='text-xs'>Período do Relatório</Label>
                        <Select value={reportPeriod} onValueChange={(v) => setReportPeriod(v as ReportPeriod)}>
                            <SelectTrigger id="report-period">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                            <SelectItem value="month">Mensal</SelectItem>
                            <SelectItem value="year">Anual</SelectItem>
                            </SelectContent>
                        </Select>
                        </div>
                    </div>
                    <div className="flex gap-2 md:col-span-2">
                    {reportPeriod === 'month' && (
                        <div className='w-full space-y-1'>
                            <Label htmlFor="report-month" className='text-xs'>Mês</Label>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger id="report-month">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value} disabled={opt.value === 'all'}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className='w-full space-y-1'>
                        <Label htmlFor="report-year" className='text-xs'>Ano</Label>
                        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                            <SelectTrigger id="report-year">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {yearOptions.map(year => (
                                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
            ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="aggregated">Relatórios Agregados</TabsTrigger>
                        <TabsTrigger value="details">Despesas Detalhadas</TabsTrigger>
                    </TabsList>
                    <TabsContent value="aggregated" className="mt-4 space-y-4">
                        <ExpenseReport contasPagas={contasPagas || []} fornecedorMap={fornecedorMap} period={reportPeriod} year={selectedYear} month={selectedMonth} />
                        <ComprasReport allEntradas={allEntradas || []} period={reportPeriod} year={selectedYear} month={selectedMonth} />
                    </TabsContent>
                    <TabsContent value="details" className="mt-4">
                        <DetailedExpensesTable 
                            entradas={filteredEntradasByPeriod} 
                            fornecedorMap={fornecedorMap}
                            onEditRequest={handleEditRequest}
                            onDeleteRequest={handleDeleteRequest}
                        />
                    </TabsContent>
                </Tabs>
            )}
        
            <Card>
                <CardHeader>
                    <CardTitle>Histórico de Preços de Compras</CardTitle>
                    <CardDescription>Pesquise um produto para ver a variação de preços ao longo do tempo.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar por nome do produto..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    {searchQuery.trim() && (
                    <div className="rounded-md border mt-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Produto</TableHead>
                                    <TableHead>Qtd.</TableHead>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead className="text-right">Preço Unit.</TableHead>
                                    <TableHead className="text-right">Valor Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredEntradasBySearch.length > 0 ? (
                                    filteredEntradasBySearch.map((entry) => {
                                        const fornecedor = fornecedorMap.get(entry.fornecedorId);
                                        return (
                                            <TableRow key={entry.id}>
                                                <TableCell>{format(new Date(entry.data), 'dd/MM/yy HH:mm')}</TableCell>
                                                <TableCell className="font-medium">{entry.produtoNome}</TableCell>
                                                <TableCell>{entry.quantidade.toLocaleString('pt-BR')}</TableCell>
                                                <TableCell style={{ color: fornecedor?.color || 'inherit' }}>
                                                    {fornecedor?.nome || 'Desconhecido'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(entry.precoUnitario)}</TableCell>
                                                <TableCell className="text-right font-mono font-semibold">{formatCurrency(entry.valorTotal)}</TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            Nenhum resultado para sua busca.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
