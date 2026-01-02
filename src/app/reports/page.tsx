
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, setYear, setMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft, Trash2, ChevronDown, Calendar, AreaChart, TrendingUp, BarChart, Info, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"

import type { DailyReport, ItemCount, BomboniereItem, Item } from '@/types';
import DailyTimelineChart from '@/components/daily-timeline-chart';
import { cn } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const ReportDetail = ({ report, bomboniereItems, isAggregate = false }: { report: DailyReport, bomboniereItems: BomboniereItem[], isAggregate?: boolean }) => {
    
    const bomboniereNameMap = useMemo(() => {
      const map = new Map<string, string>();
      if (!bomboniereItems) return map;
      bomboniereItems.forEach(item => {
        map.set(item.name.toLowerCase().replace(/\s+/g, '-'), item.name);
        map.set(item.name.toLowerCase(), item.name);
        map.set(item.id, item.name);
      });
      return map;
    }, [bomboniereItems]);

    const isBomboniere = (itemName: string): boolean => {
      if (!bomboniereItems) return false;
      const lowerItemName = itemName.toLowerCase();
      // Check by original name, normalized name, or if it exists in the map values derived from IDs.
      return bomboniereItems.some(bi => 
        bi.name.toLowerCase() === lowerItemName || 
        bi.name.toLowerCase().replace(/\s+/g, '-') === lowerItemName
      );
    };
    
    const separateItemsByCategory = (itemCount: ItemCount) => {
        const lanches: ItemCount = {};
        const bomboniere: ItemCount = {};
        if (!itemCount) return { lanches, bomboniere };

        for (const [name, count] of Object.entries(itemCount)) {
            if (isBomboniere(name)) {
                const officialName = bomboniereNameMap.get(name.toLowerCase().replace(/\s+/g, '-')) || bomboniereNameMap.get(name.toLowerCase()) || name;
                bomboniere[officialName] = (bomboniere[officialName] || 0) + count;
            } else {
                lanches[name] = (lanches[name] || 0) + count;
            }
        }
        return { lanches, bomboniere };
    };

    const chartData = [
        { name: 'Vendas Salão', value: report.totalVendasSalao, fill: 'hsl(var(--primary))' },
        { name: 'Vendas Rua', value: report.totalVendasRua, fill: 'hsl(var(--chart-2))' },
        { name: 'Fiado Salão', value: report.totalFiadoSalao, fill: 'hsl(var(--chart-3))' },
        { name: 'Fiado Rua', value: report.totalFiadoRua, fill: 'hsl(var(--chart-5))' },
    ].filter(item => item.value > 0);

    const chartConfig = {
        "Vendas Salão": { label: "Vendas Salão", color: "hsl(var(--primary))" },
        "Vendas Rua": { label: "Vendas Rua", color: "hsl(var(--chart-2))" },
        "Fiado Salão": { label: "Fiado Salão", color: "hsl(var(--chart-3))" },
        "Fiado Rua": { label: "Fiado Rua", color: "hsl(var(--chart-5))" },
    };

    const { lanchesSalao, bomboniereSalao, lanchesRua, bomboniereRua } = useMemo(() => {
        const contagemSalao: ItemCount = {};
        
        if (report.contagemTotal) {
            for (const key in report.contagemTotal) {
                const totalCount = report.contagemTotal[key] || 0;
                const ruaCount = report.contagemRua?.[key] || 0;
                const salaoCount = totalCount - ruaCount;
                if (salaoCount > 0) {
                    contagemSalao[key] = salaoCount;
                }
            }
        }
        
        const contagemRua = report.contagemRua || {};

        const { lanches: lanchesSalao, bomboniere: bomboniereSalao } = separateItemsByCategory(contagemSalao);
        const { lanches: lanchesRua, bomboniere: bomboniereRua } = separateItemsByCategory(contagemRua);
        
        return { lanchesSalao, bomboniereSalao, lanchesRua, bomboniereRua };
    }, [report.contagemTotal, report.contagemRua, bomboniereItems, separateItemsByCategory]);

    const renderItemCountList = (counts: ItemCount) => {
      if (!counts || Object.keys(counts).length === 0) {
        return null;
      }

      const sortedEntries = Object.entries(counts)
        .sort(([, aCount], [, bCount]) => bCount - aCount);

      if (sortedEntries.length === 0) {
        return null;
      }

      return (
        <div className="mt-3">
          <ul className="text-xs space-y-0.5">
            {sortedEntries.map(([name, count]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="font-bold w-6 text-right">{count}</span>
                  <span>{name}</span>
                </li>
              ))}
          </ul>
        </div>
      );
    }
    
    const renderTitledItemCountList = (counts: ItemCount, title: string, titleClassName?: string) => {
      if (!counts || Object.keys(counts).length === 0) {
        return null;
      }
      return (
        <div className="mt-3">
            <h5 className={cn("font-medium text-xs mb-2", titleClassName)}>{title}</h5>
            {renderItemCountList(counts)}
        </div>
      )
    }

    const totalBomboniereSalaoItens = useMemo(() => Object.values(bomboniereSalao).reduce((acc, count) => acc + count, 0), [bomboniereSalao]);
    const totalBomboniereRuaItens = useMemo(() => Object.values(bomboniereRua).reduce((acc, count) => acc + count, 0), [bomboniereRua]);
    const totalLanchesSalaoItens = useMemo(() => Object.values(lanchesSalao).reduce((acc, count) => acc + count, 0), [lanchesSalao]);
    const totalLanchesRuaItens = useMemo(() => Object.values(lanchesRua).reduce((acc, count) => acc + count, 0), [lanchesRua]);
    
    const totalLanchesSalaoValor = useMemo(() => {
        const totalSalao = (report.totalVendasSalao || 0) + (report.totalFiadoSalao || 0);
        return totalSalao - (report.totalBomboniereSalao || 0);
    }, [report]);

    const totalLanchesRuaValor = useMemo(() => {
        const totalRua = (report.totalVendasRua || 0) + (report.totalFiadoRua || 0);
        return totalRua - (report.totalBomboniereRua || 0);
    }, [report]);
    
    const totalGeralBomboniere = (report.totalBomboniereSalao || 0) + (report.totalBomboniereRua || 0);


  return (
    <Card>
        <CardHeader className="flex flex-row items-start justify-between">
            <div>
                <CardTitle className="text-lg">{isAggregate ? "Relatório Agregado" : "Resumo do Dia"}</CardTitle>
                {isAggregate && <CardDescription>{report.totalPedidos} pedidos em {report.id} dias</CardDescription>}
            </div>
            <div className="text-right">
                <p className="text-3xl font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                    Faturamento à Vista: <span className="font-semibold text-green-500">{formatCurrency(report.totalAVista)}</span>
                </p>
            </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Resumo Financeiro</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center"><span className="text-purple-400">Vendas Salão:</span> <span className="font-mono">{formatCurrency(report.totalVendasSalao)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-blue-400">Vendas Rua:</span> <span className="font-mono">{formatCurrency(report.totalVendasRua)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-destructive">Fiado Salão:</span> <span className="font-mono text-destructive">{formatCurrency(report.totalFiadoSalao)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-destructive">Fiado Rua:</span> <span className="font-mono text-destructive">{formatCurrency(report.totalFiadoRua)}</span></div>
                </div>
              </div>
              <Separator/>
              <div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center"><span>Total Geral Bomboniere:</span> <span className="font-mono">{formatCurrency(totalGeralBomboniere)}</span></div>
                </div>
              </div>
              <Separator/>
              <div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center text-destructive"><span>Total Entregas:</span> <span className="font-mono font-bold">{report.totalEntregas || 0} ({formatCurrency(report.totalTaxas)})</span></div>
                  <div className="flex justify-between items-center text-muted-foreground"><span>Total Geral (Itens):</span> <span className="font-mono font-bold text-foreground">{report.totalItens || 0}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                  <h3 className="font-semibold mb-2">Contagem de Itens</h3>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
                        <div>
                            <h4 className="font-medium text-sm text-purple-400 mb-1">Salão</h4>
                            {renderItemCountList(lanchesSalao)}
                            {totalLanchesSalaoItens > 0 && (
                                <div className="mt-2 pt-2 border-t border-dashed">
                                    <div className="grid grid-cols-2 items-end text-xs">
                                        <span className="text-muted-foreground">({totalLanchesSalaoItens} itens)</span>
                                        <div className="flex justify-end items-center gap-2">
                                            <span className="font-semibold text-purple-400">Total:</span>
                                            <span className="font-bold font-mono text-purple-400">{formatCurrency(totalLanchesSalaoValor)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {renderTitledItemCountList(bomboniereSalao, "Bomboniere", "text-purple-400")}
                            {report.totalBomboniereSalao > 0 && (
                                <div className="mt-2 pt-2 border-t border-dashed">
                                    <div className="grid grid-cols-2 items-end text-xs">
                                      <span className="text-muted-foreground">({totalBomboniereSalaoItens} itens)</span>
                                      <div className="flex justify-end items-center gap-2">
                                          <span className="font-semibold text-purple-400">Total:</span>
                                          <span className="font-bold font-mono text-purple-400">{formatCurrency(report.totalBomboniereSalao)}</span>
                                      </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <Separator orientation="vertical" />
                        <div>
                            <h4 className="font-medium text-sm text-blue-400 mb-1">Rua</h4>
                            {renderItemCountList(lanchesRua)}
                             {totalLanchesRuaItens > 0 && (
                                <div className="mt-2 pt-2 border-t border-dashed">
                                     <div className="grid grid-cols-2 items-end text-xs">
                                        <span className="text-muted-foreground">({totalLanchesRuaItens} itens)</span>
                                        <div className="flex justify-end items-center gap-2">
                                            <span className="font-semibold text-blue-400">Total:</span>
                                            <span className="font-bold font-mono text-blue-400">{formatCurrency(totalLanchesRuaValor)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {renderTitledItemCountList(bomboniereRua, "Bomboniere", "text-blue-400")}
                             {report.totalBomboniereRua > 0 && (
                                <div className="mt-2 pt-2 border-t border-dashed">
                                     <div className="grid grid-cols-2 items-end text-xs">
                                        <span className="text-muted-foreground">({totalBomboniereRuaItens} itens)</span>
                                        <div className="flex justify-end items-center gap-2">
                                            <span className="font-semibold text-blue-400">Total:</span>
                                            <span className="font-bold font-mono text-blue-400">{formatCurrency(report.totalBomboniereRua)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                  </div>
              </div>
              <Separator />
              <div>
                  <h3 className="font-semibold mb-2">Proporção de Vendas</h3>
                  <ChartContainer config={chartConfig as any} className="mx-auto aspect-square h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <ChartTooltip
                              cursor={false}
                              content={<ChartTooltipContent hideLabel formatter={(value, name, item) => (
                                  <div className="flex flex-col">
                                      <span>{item.payload.name}</span>
                                      <span className="font-bold">{formatCurrency(value as number)}</span>
                                  </div>
                              )} />}
                              />
                              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={40} strokeWidth={2}>
                              {chartData.map((entry) => (
                                  <Cell key={`cell-${entry.name}`} fill={entry.fill} />
                              ))}
                              </Pie>
                          </PieChart>
                      </ResponsiveContainer>
                  </ChartContainer>
              </div>
            </div>
          </div>
          {report.items && report.items.length > 0 && !isAggregate && (
            <>
              <Separator />
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                 <DailyTimelineChart items={report.items} dataType="total" title="Picos de Vendas (Valor)" color="primary" />
                 <DailyTimelineChart items={report.items} dataType="quantity" title="Picos de Vendas (Quantidade)" color="chart-2" />
              </div>
            </>
          )}
        </CardContent>
    </Card>
  )
}

const AggregateReport = ({ reports, bomboniereItems }: { reports: DailyReport[], bomboniereItems: BomboniereItem[] }) => {
    
    const aggregateReport = useMemo((): DailyReport => {
        if (!reports || reports.length === 0) {
            return { 
                id: '0',
                userId: '', reportDate: '', createdAt: '',
                totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0, totalVendasRua: 0,
                totalFiadoSalao: 0, totalFiadoRua: 0, totalKg: 0, totalTaxas: 0, totalBomboniereSalao: 0,
                totalBomboniereRua: 0, totalItens: 0, totalPedidos: 0, totalEntregas: 0, totalItensRua: 0,
                contagemTotal: {}, contagemRua: {}, items: []
            };
        }

        const initial: DailyReport = {
            id: String(reports.length), // Use ID to store the count of days
            userId: reports[0].userId,
            reportDate: '',
            createdAt: '',
            totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0, totalVendasRua: 0,
            totalFiadoSalao: 0, totalFiadoRua: 0, totalKg: 0, totalTaxas: 0, totalBomboniereSalao: 0,
            totalBomboniereRua: 0, totalItens: 0, totalPedidos: 0, totalEntregas: 0, totalItensRua: 0,
            contagemTotal: {}, contagemRua: {}, items: []
        };
        
        return reports.reduce((acc, report) => {
            acc.totalGeral += report.totalGeral || 0;
            acc.totalAVista += report.totalAVista || 0;
            acc.totalFiado += report.totalFiado || 0;
            acc.totalVendasSalao += report.totalVendasSalao || 0;
            acc.totalVendasRua += report.totalVendasRua || 0;
            acc.totalFiadoSalao += report.totalFiadoSalao || 0;
            acc.totalFiadoRua += report.totalFiadoRua || 0;
            acc.totalKg += report.totalKg || 0;
            acc.totalTaxas += report.totalTaxas || 0;
            acc.totalBomboniereSalao += report.totalBomboniereSalao || 0;
            acc.totalBomboniereRua += report.totalBomboniereRua || 0;
            acc.totalItens += report.totalItens || 0;
            acc.totalPedidos += report.totalPedidos || 0;
            acc.totalEntregas += report.totalEntregas || 0;
            acc.totalItensRua += report.totalItensRua || 0;

            for (const key in report.contagemTotal) {
                acc.contagemTotal[key] = (acc.contagemTotal[key] || 0) + report.contagemTotal[key];
            }
            for (const key in report.contagemRua) {
                acc.contagemRua[key] = (acc.contagemRua[key] || 0) + report.contagemRua[key];
            }
            
            return acc;
        }, initial);
    }, [reports]);

    if (reports.length === 0) {
        return (
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <TrendingUp className="h-5 w-5 text-muted-foreground"/>
                        Relatório Agregado
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground p-10">
                    <Info className="mx-auto h-8 w-8 mb-2"/>
                    Nenhum relatório encontrado para este período.
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="mt-6">
             <h2 className="text-xl font-semibold mb-4 flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-muted-foreground"/>
                Relatório Agregado
             </h2>
             <ReportDetail report={aggregateReport} bomboniereItems={bomboniereItems} isAggregate={true} />
        </div>
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
    { value: 'all', label: 'Ano Inteiro' },
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

export default function ReportsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const yearOptions = useMemo(() => generateYearOptions(), []);

  const dailyReportsRef = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'daily_reports'), orderBy('reportDate', 'desc')) : null), [firestore, user]);
  const bomboniereItemsRef = useMemoFirebase(() => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null), [firestore]);

  const { data: savedReports, isLoading: isLoadingReports } = useCollection<DailyReport>(dailyReportsRef);
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsRef);
  
  const filteredReportsForAggregation = useMemo(() => {
    if (!savedReports) return [];
    
    let startDate: Date;
    let endDate: Date;

    if (selectedMonth === 'all') {
        startDate = startOfYear(setYear(new Date(), selectedYear));
        endDate = endOfYear(setYear(new Date(), selectedYear));
    } else {
        const referenceDate = setMonth(setYear(new Date(), selectedYear), parseInt(selectedMonth, 10));
        startDate = startOfMonth(referenceDate);
        endDate = endOfMonth(referenceDate);
    }
    
    return savedReports.filter(r => {
        try {
            const reportDate = parseISO(r.reportDate);
            return isWithinInterval(reportDate, { start: startDate, end: endDate });
        } catch {
            return false;
        }
    });

  }, [savedReports, selectedYear, selectedMonth]);


  const handleDeleteReportRequest = (reportId: string) => {
    setReportToDelete(reportId);
  };

  const confirmDeleteReport = async () => {
    if (!firestore || !reportToDelete) return;
    try {
      await deleteDoc(doc(firestore, "daily_reports", reportToDelete));
      toast({
        title: "Sucesso",
        description: "Relatório excluído permanentemente.",
      });
    } catch (error) {
      console.error("Error deleting report:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível excluir o relatório.",
      });
    } finally {
      setReportToDelete(null);
    }
  };

  const getFormattedDate = (dateString: string) => {
    try {
        const date = parseISO(dateString + 'T12:00:00');
        return {
            day: format(date, "dd"),
            month: format(date, "MMM", { locale: ptBR }).toUpperCase(),
            dayOfWeek: format(date, "EEEE", { locale: ptBR }),
            fullDate: format(date, "dd/MM/yyyy")
        }
    } catch {
        return { day: '??', month: '???', dayOfWeek: 'Data inválida', fullDate: '??/??/????' }
    }
  };

  if (isUserLoading || isLoadingReports || isLoadingBomboniere) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o relatório selecionado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReport}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="container mx-auto max-w-5xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatórios de Vendas</h1>
              <p className="text-muted-foreground">Relatórios agregados e detalhamento por dia.</p>
            </div>
          </div>
          <div className='flex items-end gap-2'>
            <div className='w-40 space-y-1'>
              <Label htmlFor="report-month" className="text-xs text-muted-foreground">Mês</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger id="report-month">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className='w-32 space-y-1'>
              <Label htmlFor="report-year" className="text-xs text-muted-foreground">Ano</Label>
              <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
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
        </header>

        <main className="space-y-8">
            <Tabs defaultValue="agregado" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="agregado">Relatório Agregado</TabsTrigger>
                    <TabsTrigger value="diario">Histórico Diário</TabsTrigger>
                </TabsList>
                
                <TabsContent value="agregado">
                     <AggregateReport reports={filteredReportsForAggregation} bomboniereItems={bomboniereItems || []} />
                </TabsContent>

                <TabsContent value="diario" className="pt-4">
                     <h2 className="text-xl font-semibold mb-4">Relatórios Diários Salvos</h2>
                    {savedReports && savedReports.length > 0 && bomboniereItems ? (
                      <Accordion type="single" collapsible className="w-full space-y-2">
                        {savedReports.map(report => {
                          const { day, month, dayOfWeek, fullDate } = getFormattedDate(report.reportDate);
                          return (
                              <AccordionItem value={report.id} key={report.id} className="border-b-0">
                                  <div className="bg-card p-2 rounded-lg border flex items-center gap-4">
                                      <div className="bg-primary text-primary-foreground rounded-md flex flex-col items-center justify-center w-16 h-16 shrink-0">
                                          <span className="text-2xl font-bold leading-none">{day}</span>
                                          <span className="text-xs font-semibold uppercase">{month}</span>
                                      </div>

                                      <div className="flex-grow">
                                          <p className="font-semibold text-foreground capitalize">{dayOfWeek}</p>
                                          <p className="text-sm text-muted-foreground">{fullDate}</p>
                                      </div>

                                      <div className="text-right mr-4">
                                          <p className="text-xs text-muted-foreground">Total do Dia</p>
                                          <p className="font-bold text-lg text-primary">{formatCurrency(report.totalGeral)}</p>
                                      </div>

                                      <AccordionTrigger className="p-2 rounded-md hover:bg-accent [&[data-state=open]>svg]:rotate-180">
                                          <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200" />
                                      </AccordionTrigger>

                                      <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteReportRequest(report.id);
                                          }}
                                          >
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </div>
                                  <AccordionContent className="p-2 pt-2">
                                      <ReportDetail report={report} bomboniereItems={bomboniereItems} />
                                  </AccordionContent>
                              </AccordionItem>
                          )
                        })}
                      </Accordion>
                    ) : (
                      <Card>
                        <CardContent className="p-10 text-center text-muted-foreground">
                          <p>Nenhum relatório salvo encontrado.</p>
                        </CardContent>
                      </Card>
                    )}
                </TabsContent>
            </Tabs>
        </main>
      </div>
    </>
  );
}
