
'use client';

import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, isPast, isSameMonth, isSameYear, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, isToday, isWithinInterval, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ContaAPagar, Fornecedor, EntradaMercadoria, DailyReport, ItemCount } from '@/types';
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Trash2, Search, History, TrendingUp, CalendarDays, AlertTriangle, AreaChart } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from '../ui/separator';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (dateString: string) => {
    try {
        return format(parseISO(dateString + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR });
    } catch (e) {
        return dateString;
    }
}

const getStatus = (conta: ContaAPagar): { text: string; className: string; isUrgent?: boolean } => {    
    if (conta.estaPaga) {
        return { text: 'Paga', className: 'bg-green-600' };
    }
    const dueDate = parseISO(conta.dataVencimento + 'T00:00:00');
    if (isPast(dueDate) && !isToday(dueDate)) {
        return { text: 'Vencida', className: 'bg-destructive animate-pulse', isUrgent: true };
    }
    if (isToday(dueDate)) {
        return { text: 'Vence Hoje', className: 'bg-yellow-500 text-black', isUrgent: true };
    }
    return { text: 'Em Aberto', className: 'bg-muted-foreground/50' };
};


const ContasTable = ({ contas, fornecedorMap, onStatusChange, onDeleteRequest }: {
    contas: ContaAPagar[],
    fornecedorMap: Map<string, Fornecedor>,
    onStatusChange: (conta: ContaAPagar, isPaga: boolean) => void,
    onDeleteRequest: (conta: ContaAPagar) => void,
}) => {
    if (contas.length === 0) {
        return <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada para os filtros selecionados.</p>;
    }

    return (
        <div className="rounded-md border mt-4">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Fornecedor/Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {contas.map((conta) => {
                        const status = getStatus(conta);
                        const fornecedor = fornecedorMap.get(conta.fornecedorId || '');
                        return (
                            <TableRow key={conta.id} className={cn(status.isUrgent && 'bg-destructive/10')}>
                                <TableCell>
                                    <div className="font-medium" style={{ color: fornecedor?.color || 'inherit' }}>
                                        {fornecedor?.nome || 'N/A'}
                                    </div>
                                    <div className="text-sm text-muted-foreground">{conta.descricao}</div>
                                </TableCell>
                                <TableCell className={cn(status.isUrgent && 'font-semibold text-foreground')}>{formatDate(conta.dataVencimento)}</TableCell>
                                <TableCell>
                                    <Badge variant={conta.estaPaga ? 'default' : 'secondary'} className={cn('pointer-events-none', status.className)}>
                                        {status.text}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold">{formatCurrency(conta.valor)}</TableCell>
                                <TableCell className="text-right">
                                     <div className="flex items-center justify-end gap-1">
                                        <Switch
                                            checked={conta.estaPaga}
                                            onCheckedChange={(isPaga) => onStatusChange(conta, isPaga)}
                                            aria-label="Marcar como paga"
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => onDeleteRequest(conta)}>
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
    );
}

type FilterType = 'all' | 'vencidas' | 'hoje' | 'semana' | 'mes';

type SalesReportPeriod = 'week' | 'month' | 'year';

interface AggregatedItem {
    name: string;
    quantity: number;
    totalValue: number;
}

const SalesReport = ({ reports, period }: { reports: DailyReport[], period: SalesReportPeriod }) => {
    const aggregatedData = useMemo(() => {
        const now = new Date();
        let startDate: Date;

        if (period === 'week') {
            startDate = startOfWeek(now, { locale: ptBR });
        } else if (period === 'month') {
            startDate = startOfMonth(now);
        } else { // year
            startDate = startOfYear(now);
        }

        const relevantReports = reports.filter(r => isWithinInterval(parseISO(r.reportDate + 'T00:00:00'), { start: startDate, end: now }));
        
        if (relevantReports.length === 0) {
            return { items: [], totalRevenue: 0, totalItems: 0 };
        }

        const itemMap = new Map<string, { quantity: number, totalValue: number }>();
        let totalRevenue = 0;

        for (const report of relevantReports) {
            totalRevenue += report.totalGeral;
            for (const item of report.items) {
                const processItems = (itemsToProcess: any[], priceField: string, qtyField: string, nameField: string) => {
                    if (!itemsToProcess) return;
                    for (const subItem of itemsToProcess) {
                        const name = subItem[nameField];
                        const quantity = subItem[qtyField];
                        const price = subItem[priceField];
                        const value = price * quantity;
                        
                        const existing = itemMap.get(name) || { quantity: 0, totalValue: 0 };
                        itemMap.set(name, {
                            quantity: existing.quantity + quantity,
                            totalValue: existing.totalValue + value,
                        });
                    }
                };
                
                // Predefined Items (sandwiches etc)
                if (item.predefinedItems) {
                    const groupedByName = item.predefinedItems.reduce((acc, p) => {
                        acc[p.name] = (acc[p.name] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>);
                    
                    for (const name in groupedByName) {
                        const quantity = groupedByName[name];
                        const price = item.predefinedItems.find(p => p.name === name)!.price;
                        const value = price * quantity;

                        const existing = itemMap.get(name) || { quantity: 0, totalValue: 0 };
                        itemMap.set(name, {
                            quantity: existing.quantity + quantity,
                            totalValue: existing.totalValue + value,
                        });
                    }
                }
                
                // Bomboniere Items
                processItems(item.bomboniereItems || [], 'price', 'quantity', 'name');
                
                // KG items
                if (item.individualPrices) {
                    const name = 'KG';
                    const quantity = item.individualPrices.length;
                    const value = item.individualPrices.reduce((sum, p) => sum + p, 0);

                    const existing = itemMap.get(name) || { quantity: 0, totalValue: 0 };
                    itemMap.set(name, {
                        quantity: existing.quantity + quantity,
                        totalValue: existing.totalValue + value,
                    });
                }
            }
        }
        
        const items = Array.from(itemMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a,b) => b.quantity - a.quantity);
        
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

        return { items, totalRevenue, totalItems };

    }, [reports, period]);

    const periodLabel = { week: 'Semanal', month: 'Mensal', year: 'Anual' }[period];
    
    return (
        <Card className="mt-6">
            <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Relatório de Vendas {periodLabel}</CardTitle>
                    <CardDescription>Resumo de itens vendidos e faturamento no período.</CardDescription>
                  </div>
                  <div className="text-right">
                      <p className="text-xs text-muted-foreground">Faturamento Total</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(aggregatedData.totalRevenue)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{aggregatedData.totalItems} itens vendidos</p>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
                {aggregatedData.items.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">Nenhum dado de vendas encontrado para este período.</p>
                ) : (
                    <div className="rounded-md border max-h-[400px] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-muted">
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead className="text-right">Quantidade</TableHead>
                                    <TableHead className="text-right">Valor Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {aggregatedData.items.map(item => (
                                    <TableRow key={item.name}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.totalValue)}</TableCell>
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

export default function ContasAPagarPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [contaToDelete, setContaToDelete] = useState<ContaAPagar | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [salesReportPeriod, setSalesReportPeriod] = useState<SalesReportPeriod>('week');


    const contasQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc')) : null,
        [firestore]
    );

    const fornecedoresQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'fornecedores')) : null,
        [firestore]
    );

    const allEntradasQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'entradas_mercadorias'), orderBy('data', 'desc')) : null,
        [firestore]
    );

    const dailyReportsQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'daily_reports'), orderBy('reportDate', 'desc')) : null,
        [firestore]
    );


    const { data: allContas, isLoading: isLoadingContas } = useCollection<ContaAPagar>(contasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const { data: allEntradas, isLoading: isLoadingAllEntradas } = useCollection<EntradaMercadoria>(allEntradasQuery);
    const { data: dailyReports, isLoading: isLoadingDailyReports } = useCollection<DailyReport>(dailyReportsQuery);


    const fornecedorMap = useMemo(() => {
        if (!fornecedores) return new Map<string, Fornecedor>();
        return new Map(fornecedores.map(f => [f.id, f]));
    }, [fornecedores]);

    const filteredEntradas = useMemo(() => {
        if (!allEntradas) return [];
        if (!searchQuery.trim()) return [];
        return allEntradas.filter(entrada => 
            entrada.produtoNome.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [allEntradas, searchQuery]);
    
    const { contasAPagar, contasPagas, expenseSummary, counts } = useMemo(() => {
        const now = new Date();
        const startOfCurrentMonth = startOfMonth(now);
        const endOfCurrentMonth = endOfMonth(now);
        const startOfCurrentYear = startOfYear(now);
        const endOfCurrentYear = endOfYear(now);
        
        let monthTotal = 0;
        let yearTotal = 0;
        let aPagar: ContaAPagar[] = [];
        let pagas: ContaAPagar[] = [];

        if (!allContas) return { contasAPagar: [], contasPagas: [], expenseSummary: { month: 0, year: 0 }, counts: { vencidas: 0, hoje: 0, semana: 0, mes: 0 } };

        allContas.forEach(conta => {
            try {
                const dueDate = parseISO(conta.dataVencimento + 'T00:00:00');
                if (conta.estaPaga) {
                    pagas.push(conta);
                    if (isWithinInterval(dueDate, { start: startOfCurrentMonth, end: endOfCurrentMonth })) {
                        monthTotal += conta.valor;
                    }
                    if (isWithinInterval(dueDate, { start: startOfCurrentYear, end: endOfCurrentYear })) {
                        yearTotal += conta.valor;
                    }
                } else {
                    aPagar.push(conta);
                }
            } catch(e) {
                console.error("Invalid date for account:", conta);
            }
        });

        const today = new Date();
        today.setHours(0,0,0,0);
        const startOfCurrentWeek = startOfWeek(today, { locale: ptBR });
        const endOfCurrentWeek = endOfWeek(today, { locale: ptBR });

        const countVencidas = aPagar.filter(c => isPast(parseISO(c.dataVencimento + 'T00:00:00')) && !isToday(parseISO(c.dataVencimento + 'T00:00:00'))).length;
        const countHoje = aPagar.filter(c => isToday(parseISO(c.dataVencimento + 'T00:00:00'))).length;
        const countSemana = aPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: today, end: endOfCurrentWeek })).length;
        const countMes = aPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: today, end: endOfCurrentMonth })).length;
        
        pagas.sort((a, b) => new Date(b.dataVencimento).getTime() - new Date(a.dataVencimento).getTime());

        return { 
            contasAPagar: aPagar, 
            contasPagas: pagas, 
            expenseSummary: { month: monthTotal, year: yearTotal },
            counts: { vencidas: countVencidas, hoje: countHoje, semana: countSemana, mes: countMes }
        };

    }, [allContas]);

    const filteredContasAPagar = useMemo(() => {
        if (activeFilter === 'all') return contasAPagar;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (activeFilter === 'vencidas') {
            return contasAPagar.filter(c => isPast(parseISO(c.dataVencimento + 'T00:00:00')) && !isToday(parseISO(c.dataVencimento + 'T00:00:00')));
        }
        if (activeFilter === 'hoje') {
            return contasAPagar.filter(c => isToday(parseISO(c.dataVencimento + 'T00:00:00')));
        }
        if (activeFilter === 'semana') {
            const startOfCurrentWeek = startOfWeek(today, { locale: ptBR });
            const endOfCurrentWeek = endOfWeek(today, { locale: ptBR });
            return contasAPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startOfCurrentWeek, end: endOfCurrentWeek }));
        }
        if (activeFilter === 'mes') {
            const startOfCurrentMonth = startOfMonth(today);
            const endOfCurrentMonth = endOfMonth(today);
            return contasAPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startOfCurrentMonth, end: endOfCurrentMonth }));
        }
        return [];

    }, [contasAPagar, activeFilter]);


    const handleStatusChange = (conta: ContaAPagar, isPaga: boolean) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'contas_a_pagar', conta.id);
        updateDocumentNonBlocking(docRef, { estaPaga: isPaga });
        toast({
            title: `Conta ${isPaga ? 'marcada como paga' : 'marcada como em aberto'}.`,
            description: conta.descricao,
        });
    };

    const handleDeleteRequest = (conta: ContaAPagar) => {
        setContaToDelete(conta);
    };

    const confirmDelete = () => {
        if (!firestore || !contaToDelete) return;
        deleteDocumentNonBlocking(doc(firestore, "contas_a_pagar", contaToDelete.id));
        toast({
            title: "Sucesso",
            description: "Conta a pagar removida.",
        });
        setContaToDelete(null);
    };
    
    const isLoading = isLoadingContas || isLoadingFornecedores || isLoadingAllEntradas || isLoadingDailyReports;

    const FilterButton = ({ filter, label, count }: { filter: FilterType, label: string, count: number }) => (
        <Button
            variant={activeFilter === filter ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(filter)}
            className="flex items-center gap-2"
        >
            {label}
            {count > 0 && <Badge variant={activeFilter === filter ? 'secondary' : 'default'} className="bg-red-500">{count}</Badge>}
        </Button>
    )

    return (
        <div className="space-y-6">
            <AlertDialog open={!!contaToDelete} onOpenChange={(open) => !open && setContaToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                        Essa ação não pode ser desfeita. Isso excluirá permanentemente a conta a pagar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pagas Este Mês</CardTitle>
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingContas ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">{formatCurrency(expenseSummary.month)}</div>}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pagas Este Ano</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingContas ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">{formatCurrency(expenseSummary.year)}</div>}
                    </CardContent>
                </Card>
            </div>

            <Separator />
            
            <div className="space-y-4">
                 <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <AreaChart className="h-5 w-5" />
                    Relatórios de Vendas
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                     <Button
                        variant={salesReportPeriod === 'week' ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSalesReportPeriod('week')}
                    >
                        Semanal
                    </Button>
                     <Button
                        variant={salesReportPeriod === 'month' ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSalesReportPeriod('month')}
                    >
                        Mensal
                    </Button>
                     <Button
                        variant={salesReportPeriod === 'year' ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSalesReportPeriod('year')}
                    >
                        Anual
                    </Button>
                </div>
                {isLoadingDailyReports ? (
                     <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                ) : (
                    <SalesReport reports={dailyReports || []} period={salesReportPeriod} />
                )}
            </div>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Controle de Contas a Pagar</CardTitle>
                    <CardDescription>Gira as suas contas pendentes e já pagas.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="a-pagar" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="a-pagar">A Pagar</TabsTrigger>
                            <TabsTrigger value="pagas">Pagas</TabsTrigger>
                        </TabsList>
                        <TabsContent value="a-pagar">
                            <div className="mt-4 space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <FilterButton filter="all" label="Todas" count={0} />
                                    <FilterButton filter="vencidas" label="Vencidas" count={counts.vencidas} />
                                    <FilterButton filter="hoje" label="Vence Hoje" count={counts.hoje} />
                                    <FilterButton filter="semana" label="Esta Semana" count={counts.semana} />
                                    <FilterButton filter="mes" label="Este Mês" count={counts.mes} />
                                </div>
                                {isLoading ? (
                                    <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                                ) : (
                                    <ContasTable contas={filteredContasAPagar} fornecedorMap={fornecedorMap} onStatusChange={handleStatusChange} onDeleteRequest={handleDeleteRequest} />
                                )}
                            </div>
                        </TabsContent>
                        <TabsContent value="pagas">
                            {isLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                            ) : (
                                <ContasTable contas={contasPagas} fornecedorMap={fornecedorMap} onStatusChange={handleStatusChange} onDeleteRequest={handleDeleteRequest} />
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <Separator className="my-8" />

            <div className="space-y-4">
                 <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Histórico de Preços de Compras
                </h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar por nome do produto para ver o histórico..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                {searchQuery.trim() && (
                  <div className="rounded-md border">
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead>Data</TableHead>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Fornecedor</TableHead>
                                  <TableHead className="text-right">Preço Unitário</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {isLoadingAllEntradas || isLoadingFornecedores ? (
                                  <TableRow>
                                      <TableCell colSpan={4} className="h-24 text-center">
                                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                      </TableCell>
                                  </TableRow>
                              ) : filteredEntradas.length > 0 ? (
                                  filteredEntradas.map((entry) => {
                                      const fornecedor = fornecedorMap.get(entry.fornecedorId);
                                      return (
                                        <TableRow key={entry.id}>
                                            <TableCell>{format(new Date(entry.data), 'dd/MM/yy HH:mm')}</TableCell>
                                            <TableCell className="font-medium">{entry.produtoNome}</TableCell>
                                            <TableCell style={{ color: fornecedor?.color || 'inherit' }}>
                                                {fornecedor?.nome || 'Desconhecido'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(entry.precoUnitario)}</TableCell>
                                        </TableRow>
                                      )
                                  })
                              ) : (
                                  <TableRow>
                                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                          Nenhum resultado para sua busca.
                                      </TableCell>
                                  </TableRow>
                              )}
                          </TableBody>
                      </Table>
                  </div>
                )}
            </div>
        </div>
    );
}
