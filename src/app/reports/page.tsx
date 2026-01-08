
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { format, parse, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft, Trash2, ChevronDown, TrendingUp, Info, RefreshCw, ChevronLeft, ChevronRight, ShieldX, Users } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import PasswordDialog from '@/components/password-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';

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
    }, [report.contagemTotal, report.contagemRua, bomboniereItems]);

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
                contagemTotal: {}, contagemRua: {},
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
            contagemTotal: {}, contagemRua: {},
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
        years.push({ value: String(i), label: String(i) });
    }
    return years;
}

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i),
    label: format(new Date(2000, i), 'MMMM', { locale: ptBR })
}));


function ReportsPageContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [reportToDelete, setReportToDelete] = useState<DailyReport | null>(null);
  const [currentMonth, setCurrentMonth] = useState(String(new Date().getMonth()));
  const [currentYear, setCurrentYear] = useState(String(new Date().getFullYear()));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  
  const [savedReports, setSavedReports] = useState<DailyReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);

  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
        try {
            const sessionAuth = sessionStorage.getItem('admin-authenticated');
            if (sessionAuth === 'true') {
                setIsAuthenticated(true);
            }
        } catch (e) {
            console.error("Could not read sessionStorage:", e);
        } finally {
            setIsAuthChecked(true);
        }
    }
  }, []);

  const handleAuthSuccess = () => {
    try {
        sessionStorage.setItem('admin-authenticated', 'true');
    } catch (e) {
        console.error("Could not write to sessionStorage:", e);
    }
    setIsAuthenticated(true);
  }

  const bomboniereQuery = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null,
    [firestore]
  );

  const { data: bomboniereItems, isLoading: isLoadingBomboniere, error: bomboniereError } = useCollection<BomboniereItem>(bomboniereQuery);

  const fetchReports = useCallback(async () => {
    if (!firestore || !user) return;
    setIsLoadingReports(true);
    
    try {
        const globalReportsQuery = query(collection(firestore, 'daily_reports'), orderBy('createdAt', 'desc'));
        const userReportsQuery = query(collection(firestore, 'users', user.uid, 'daily_reports'), orderBy('createdAt', 'desc'));

        const [globalReportsSnapshot, userReportsSnapshot] = await Promise.all([
            getDocs(globalReportsQuery),
            getDocs(userReportsQuery)
        ]);

        const allReportsMap = new Map<string, DailyReport>();

        userReportsSnapshot.forEach(doc => {
            // Assume user-specific reports are older and might be duplicates, so they can be overwritten by global ones if IDs clash.
            allReportsMap.set(doc.id, { ...doc.data(), id: doc.id } as DailyReport);
        });

        globalReportsSnapshot.forEach(doc => {
            allReportsMap.set(doc.id, { ...doc.data(), id: doc.id } as DailyReport);
        });
        
        const combinedReports = Array.from(allReportsMap.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setSavedReports(combinedReports);

    } catch (error) {
        console.error("Error fetching reports:", error);
        toast({
            title: "Erro ao buscar relatórios",
            description: "Não foi possível carregar os relatórios. Verifique sua conexão.",
            variant: "destructive"
        });
    } finally {
        setIsLoadingReports(false);
    }
  }, [firestore, user, toast]);

  useEffect(() => {
    if (isAuthenticated) {
        fetchReports();
    }
  }, [isAuthenticated, fetchReports]);


  const isLoading = isUserLoading || isLoadingReports || isLoadingBomboniere;

  const yearOptions = useMemo(() => generateYearOptions(), []);

  const filteredReports = useMemo(() => {
    if (!savedReports) return [];
  
    const year = parseInt(currentYear);
    const month = parseInt(currentMonth);
  
    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));
  
    return savedReports.filter(r => {
      try {
        const reportDate = parseISO(r.reportDate);
        return isWithinInterval(reportDate, { start: startDate, end: endDate });
      } catch {
        return false;
      }
    });
  
  }, [savedReports, currentYear, currentMonth]);
  
  const handleDeleteReportRequest = (report: DailyReport) => {
    setReportToDelete(report);
  };

  const confirmDeleteReport = async () => {
    if (!firestore || !user || !reportToDelete?.id) return;
    
    try {
        const batch = writeBatch(firestore);

        const orderItemsCollectionRef = collection(firestore, 'order_items');
        const liveItemsCollectionRef = collection(firestore, 'live_items');
        const reportStartOfDay = startOfDay(parseISO(reportToDelete.reportDate));
        const reportEndOfDay = endOfDay(parseISO(reportToDelete.reportDate));
        
        const q = query(orderItemsCollectionRef, 
            where('timestamp', '>=', reportStartOfDay), 
            where('timestamp', '<=', reportEndOfDay)
        );

        const orderItemsSnapshot = await getDocs(q);
        
        orderItemsSnapshot.forEach((docSnapshot) => {
            const liveItemRef = doc(liveItemsCollectionRef, docSnapshot.id);
            // Move item back to live_items by setting it there and deleting from order_items
            batch.set(liveItemRef, { ...docSnapshot.data(), reportado: false });
            batch.delete(docSnapshot.ref);
        });
        
        // Reports could be global or user-specific. Try deleting from both.
        // It's safe to call delete on a non-existent doc.
        const reportDocRefGlobal = doc(firestore, "daily_reports", reportToDelete.id);
        const reportDocRefUser = doc(firestore, "users", user.uid, "daily_reports", reportToDelete.id);
        
        batch.delete(reportDocRefGlobal);
        batch.delete(reportDocRefUser);

        await batch.commit();

        toast({
            title: "Sucesso",
            description: "Relatório excluído e os seus itens foram movidos de volta para a tela principal.",
        });

        // Refetch reports to update the UI
        fetchReports();

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
  
  const getFormattedDate = (date: Date | string) => {
    try {
        const d = date instanceof Date ? date : parseISO(date);
        return {
            day: format(d, "dd"),
            month: format(d, "MMM", { locale: ptBR }).toUpperCase(),
            dayOfWeek: format(d, "EEEE", { locale: ptBR }),
            fullDate: format(d, "dd/MM/yyyy")
        }
    } catch {
        return { day: '??', month: '???', dayOfWeek: 'Data inválida', fullDate: '??/??/????' }
    }
  };

  if (isLoading || !isAuthChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
            <h2 className="text-center text-2xl font-bold mb-2 flex items-center justify-center gap-2"><ShieldX className="h-7 w-7 text-destructive"/> Acesso Restrito</h2>
            <p className="text-center text-muted-foreground mb-6">Esta secção requer uma senha para aceder.</p>
            <PasswordDialog 
                open={true}
                onOpenChange={(isOpen) => { if(!isOpen) router.push('/'); }}
                onSuccess={handleAuthSuccess}
                showCancel={true}
            />
        </div>
      </div>
    )
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

      <div className="container mx-auto max-w-5xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/reports/fiados')}>
                <Users className="mr-2 h-4 w-4" />
                Relatório de Fiados
            </Button>
          </div>
        </header>

        <main className="space-y-8">
            <Card>
                <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center">
                    <div className="flex-1 w-full sm:w-auto">
                        <Label htmlFor="report-month" className="text-xs text-muted-foreground">Mês</Label>
                         <Select value={currentMonth} onValueChange={setCurrentMonth}>
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
                     <div className="flex-1 w-full sm:w-auto">
                        <Label htmlFor="report-year" className="text-xs text-muted-foreground">Ano</Label>
                         <Select value={currentYear} onValueChange={setCurrentYear}>
                            <SelectTrigger id="report-year">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {yearOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <Tabs defaultValue="agregado" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="agregado">Relatório Agregado do Mês</TabsTrigger>
                        <TabsTrigger value="diario">Histórico Diário do Mês</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="agregado">
                        <AggregateReport reports={filteredReports} bomboniereItems={bomboniereItems || []} />
                    </TabsContent>

                    <TabsContent value="diario" className="pt-4">
                        <h2 className="text-xl font-semibold mb-4">Relatórios Diários Salvos</h2>
                        {filteredReports && filteredReports.length > 0 && bomboniereItems ? (
                        <Accordion type="single" collapsible className="w-full space-y-2">
                            {filteredReports.map(report => {
                            const { day, month, dayOfWeek, fullDate } = getFormattedDate(report.createdAt);
                            return (
                                <AccordionItem value={report.id!} key={`${report.id}-${report.createdAt}`}>
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

                                        <AccordionTrigger>
                                            <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200" />
                                        </AccordionTrigger>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteReportRequest(report);
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
                            <p>Nenhum relatório salvo encontrado para o período selecionado.</p>
                            </CardContent>
                        </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </main>
      </div>
    </>
  );
}

export default function ReportsPage() {
    return (
        <ReportsPageContent />
    )
}
