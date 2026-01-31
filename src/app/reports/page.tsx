'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs, deleteDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, isSameDay, setMonth, setYear, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRouter } from 'next/navigation';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Trash2, ChevronDown, TrendingUp, Info, Users, BarChart, Pencil, Calendar as CalendarIcon } from 'lucide-react';
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Calendar } from '@/components/ui/calendar';
import type { DailyReport, ItemCount, BomboniereItem, SavedFavorite } from '@/types';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';


const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const ReportDetail = ({ report, bomboniereItems, isAggregate = false }: { report: DailyReport | null, bomboniereItems: BomboniereItem[], isAggregate?: boolean }) => {
    
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
      return bomboniereItems.some(bi => 
        bi.name.toLowerCase() === lowerItemName || 
        bi.name.toLowerCase().replace(/\s+/g, '-') === lowerItemName
      );
    };
    
    const separateItemsByCategory = useCallback((itemCount: ItemCount) => {
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
    }, [isBomboniere, bomboniereNameMap]);
    
    if (!report) {
         return (
             <Card>
                <CardContent className="text-center text-muted-foreground p-10 h-[500px] flex flex-col justify-center items-center">
                    <Info className="mx-auto h-8 w-8 mb-2"/>
                    <p>Selecione um dia na lista para ver os detalhes.</p>
                </CardContent>
            </Card>
        )
    }

    const chartData = [
        { name: 'Vendas Salão', value: report.totalVendasSalao || 0, fill: 'hsl(var(--chart-1))' },
        { name: 'Vendas Rua', value: report.totalVendasRua || 0, fill: 'hsl(var(--chart-2))' },
        { name: 'Fiado Salão', value: report.totalFiadoSalao || 0, fill: 'hsl(var(--chart-3))' },
        { name: 'Fiado Rua', value: report.totalFiadoRua || 0, fill: 'hsl(var(--chart-5))' },
    ].filter(item => item.value > 0);

    const chartConfig = {
        "Vendas Salão": { label: "Vendas Salão", color: "hsl(var(--chart-1))" },
        "Vendas Rua": { label: "Vendas Rua", color: "hsl(var(--chart-2))" },
        "Fiado Salão": { label: "Fiado Salão", color: "hsl(var(--chart-3))" },
        "Fiado Rua": { label: "Fiado Rua", color: "hsl(var(--chart-5))" },
    } satisfies ChartConfig;

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
    }, [report.contagemTotal, report.contagemRua, separateItemsByCategory]);

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
                <CardTitle className="text-lg">{isAggregate ? "Relatório Agregado do Mês" : "Resumo do Dia"}</CardTitle>
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
                  <div className="flex justify-between items-center text-destructive"><span>Fiado Salão:</span> <span className="font-mono text-destructive">{formatCurrency(report.totalFiadoSalao)}</span></div>
                  <div className="flex justify-between items-center text-destructive"><span>Fiado Rua:</span> <span className="font-mono text-destructive">{formatCurrency(report.totalFiadoRua)}</span></div>
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
                  <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[180px]">
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
        </CardContent>
    </Card>
  )
}

const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear + 5; i >= currentYear - 5; i--) {
        years.push(i);
    }
    return years;
}

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i),
    label: format(new Date(2000, i), 'MMMM', { locale: ptBR })
}));

function ReportsPageContent() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const [reportToDelete, setReportToDelete] = useState<DailyReport | null>(null);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('daily');
  
  const reportsQuery = useMemo(() => {
    if (!firestore) return null;
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);

    const q = query(
        collection(firestore, 'daily_reports'),
        where('reportDate', '>=', format(start, 'yyyy-MM-dd')),
        where('reportDate', '<=', format(end, 'yyyy-MM-dd')),
        orderBy('reportDate', 'desc')
    );
    return q;
  }, [firestore, currentDate]);

  const { data: savedReports, isLoading: isLoadingReports } = useCollection<DailyReport>(reportsQuery);
  

  const bomboniereQuery = useMemo(
    () => firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null,
    [firestore]
  );
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereQuery);

  const isLoading = isLoadingReports || isLoadingBomboniere || isUserLoading;


  const handleDeleteReportRequest = (reportId: string) => {
    const report = savedReports?.find(r => r.id === reportId);
    if(report) {
        setReportToDelete(report);
    }
  };
  
  const confirmDeleteReport = async () => {
    if (!firestore || !reportToDelete?.id || !reportToDelete.reportDate) return;
    
    try {
        const batch = writeBatch(firestore);
        
        const reportDateStr = reportToDelete.reportDate;

        const orderItemsQuery = query(
          collection(firestore, 'order_items'), 
          where('reportDate', '==', reportDateStr)
        );
        const orderItemsSnapshot = await getDocs(orderItemsQuery);

        if (orderItemsSnapshot.empty) {
            console.warn("No archived items found for this report date. Deleting report only.");
        }

        orderItemsSnapshot.forEach(orderDoc => {
            const item = orderDoc.data();
            const liveItemRef = doc(collection(firestore, 'live_items'), orderDoc.id);
            batch.set(liveItemRef, { ...item, reportado: false });
            batch.delete(orderDoc.ref);
        });
        
        const reportDocRef = doc(firestore, "daily_reports", reportToDelete.id);
        batch.delete(reportDocRef);

        await batch.commit();
        
        setSelectedReportId(null);
        
        toast({
            title: "Sucesso",
            description: "Relatório excluído e os seus itens foram movidos de volta para a tela principal.",
        });

    } catch (error: any) {
        console.error("Error deleting report:", error);
        toast({
            variant: "destructive",
            title: "Erro",
            description: error.message || "Não foi possível excluir o relatório.",
        });
    } finally {
        setReportToDelete(null);
    }
  };
  
  const aggregateReport = useMemo((): DailyReport | null => {
        if (!savedReports || savedReports.length === 0) return null;

        const initial: DailyReport = {
            id: String(savedReports.length),
            reportDate: '',
            createdAt: '',
            userId: user?.uid || '',
            totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0, totalVendasRua: 0,
            totalFiadoSalao: 0, totalFiadoRua: 0, totalKg: 0, totalTaxas: 0, totalBomboniereSalao: 0,
            totalBomboniereRua: 0, totalItens: 0, totalPedidos: 0, totalEntregas: 0, totalItensRua: 0,
            contagemTotal: {}, contagemRua: {},
        };
        
        return savedReports.reduce((acc, report) => {
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
                acc.contagemTotal[key] = (acc.contagemTotal[key] || 0) + (report.contagemTotal[key] || 0);
            }
            for (const key in report.contagemRua) {
                acc.contagemRua[key] = (acc.contagemRua[key] || 0) + (report.contagemRua[key] || 0);
            }
            
            return acc;
        }, initial);
    }, [savedReports, user]);


  if (isLoading) {
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
              Esta ação não pode ser desfeita. O relatório será excluído e os seus itens voltarão para a tela principal como "não reportados".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReport}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <main className="space-y-6">
        <div className="flex items-center justify-between">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="month-select" className="text-sm font-medium text-muted-foreground">Mês</label>
                    <Select
                        value={String(currentDate.getMonth())}
                        onValueChange={(value) => setCurrentDate(setMonth(new Date(currentDate), parseInt(value)))}
                    >
                        <SelectTrigger id="month-select" className="w-[180px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 <div>
                    <label htmlFor="year-select" className="text-sm font-medium text-muted-foreground">Ano</label>
                    <Select
                        value={String(currentDate.getFullYear())}
                        onValueChange={(value) => setCurrentDate(setYear(new Date(currentDate), parseInt(value)))}
                    >
                        <SelectTrigger id="year-select" className="w-[120px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {generateYearOptions().map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="aggregate">
                    <BarChart className="mr-2 h-4 w-4" />
                    Relatório Agregado do Mês
                </TabsTrigger>
                <TabsTrigger value="daily">
                    <BarChart className="mr-2 h-4 w-4" />
                    Histórico Diário do Mês
                </TabsTrigger>
            </TabsList>
            <TabsContent value="aggregate" className="mt-4">
                 {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                 ) : savedReports && savedReports.length > 0 && aggregateReport ? (
                    <ReportDetail report={aggregateReport} bomboniereItems={bomboniereItems || []} isAggregate={true} />
                 ) : (
                    <Card>
                        <CardContent className="text-center text-muted-foreground py-20">
                            <Info className="mx-auto h-8 w-8 mb-2"/>
                            <p>Nenhum relatório encontrado para o mês de {format(currentDate, 'MMMM', { locale: ptBR })}.</p>
                        </CardContent>
                    </Card>
                 )}
            </TabsContent>
            <TabsContent value="daily" className="mt-4">
                 <h2 className="text-lg font-semibold mb-4">Relatórios Salvos no Mês</h2>
                {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                    </div>
                ) : (
                <Accordion type="single" collapsible className="w-full space-y-3" value={selectedReportId || ''} onValueChange={setSelectedReportId}>
                    {savedReports && savedReports.length > 0 ? (
                        savedReports.map(report => {
                            if (!report || !report.id || !report.reportDate) return null;
                            const reportDate = parseISO(report.reportDate);

                            return (
                                <AccordionItem value={report.id} key={report.id} className="border-b-0">
                                    <div className="flex items-center rounded-lg border bg-card data-[state=open]:rounded-b-none data-[state=open]:border-b-0 hover:bg-accent/50 transition-colors">
                                        <AccordionTrigger className="p-4 flex-1 hover:no-underline text-left">
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center justify-center rounded-md bg-primary p-2 text-primary-foreground w-16 h-16 shrink-0">
                                                        <span className="text-3xl font-bold leading-none">{format(reportDate, "dd")}</span>
                                                        <span className="text-sm font-medium uppercase tracking-wider">{format(reportDate, "MMM", { locale: ptBR })}</span>
                                                    </div>
                                                    <div>
                                                         <p className="font-semibold text-lg capitalize">{format(reportDate, "eeee", { locale: ptBR })}</p>
                                                        <p className="text-sm text-muted-foreground">{format(reportDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-muted-foreground">Total do Dia</p>
                                                    <p className="text-xl font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            aria-label="Excluir Relatório"
                                            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), "h-9 w-9 text-muted-foreground hover:text-destructive shrink-0 mr-2")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteReportRequest(report.id!);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                   e.stopPropagation();
                                                   handleDeleteReportRequest(report.id!);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <AccordionContent className="p-0 border border-t-0 rounded-t-none rounded-b-lg bg-card overflow-hidden">
                                         {selectedReportId === report.id && bomboniereItems ? (
                                            <ReportDetail report={report} bomboniereItems={bomboniereItems} />
                                        ) : (
                                            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin"/></div>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>
                            )
                        })
                    ) : (
                         <div className="text-center text-muted-foreground py-10">
                            <Info className="mx-auto h-8 w-8 mb-2"/>
                            <p>Nenhum relatório encontrado para o mês de {format(currentDate, 'MMMM', { locale: ptBR })} de {currentDate.getFullYear()}.</p>
                        </div>
                    )}
                </Accordion>
                )}
            </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

export default function ReportsPage() {
    const { isUserLoading } = useUser();

    if (isUserLoading) {
        return (
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-muted-foreground">A ligar à base de dados...</p>
          </div>
        );
    }
    
    return <ReportsPageContent />;
}
