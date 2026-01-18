
'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, isWithinInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, setYear, setMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ContaAPagar, Fornecedor, EntradaMercadoria } from '@/types';

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
import { Loader2, Search, CalendarDays, TrendingUp } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
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
    
    const [searchQuery, setSearchQuery] = useState('');
    const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('month');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));
    const yearOptions = useMemo(() => generateYearOptions(), []);

    const contasQuery = useMemo(() => firestore ? query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc')) : null, [firestore]);
    const fornecedoresQuery = useMemo(() => firestore ? query(collection(firestore, 'fornecedores')) : null, [firestore]);
    const entradasQuery = useMemo(() => firestore ? query(collection(firestore, 'entradas_mercadorias'), orderBy('data', 'desc')) : null, [firestore]);

    const { data: allContas, isLoading: isLoadingContas } = useCollection<ContaAPagar>(contasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const { data: allEntradas, isLoading: isLoadingEntradas } = useCollection<EntradaMercadoria>(entradasQuery);

    const isLoading = isLoadingContas || isLoadingFornecedores || isLoadingEntradas;

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

    return (
        <div className="space-y-6">
            
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
                <div className="space-y-4">
                    <ExpenseReport contasPagas={contasPagas || []} fornecedorMap={fornecedorMap} period={reportPeriod} year={selectedYear} month={selectedMonth} />
                    <ComprasReport allEntradas={allEntradas || []} period={reportPeriod} year={selectedYear} month={selectedMonth} />
                </div>
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
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead className="text-right">Preço Unitário</TableHead>
                                    <TableHead className="text-right">Valor Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
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
                                                <TableCell className="text-right font-mono font-semibold">{formatCurrency(entry.valorTotal)}</TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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
