'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { 
    format, 
    parseISO, 
    startOfWeek, 
    endOfWeek, 
    startOfMonth, 
    endOfMonth, 
    startOfYear, 
    endOfYear, 
    getWeek,
    getYear,
    getMonth,
    setYear,
    setMonth
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Trash2, Info, CalendarDays, BarChart4, AreaChart, LineChart, GanttChart, ListOrdered, User } from 'lucide-react';
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DailyReport, ItemCount, BomboniereItem, Item } from '@/types';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import ItemList from '@/components/item-list';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const ArchivedItemsTable = ({ reportDate }: { reportDate: string }) => {
    const firestore = useFirestore();
    const [items, setItems] = useState<Item[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchItems = async () => {
            if (!firestore || !reportDate) return;
            setLoading(true);
            try {
                const q = query(
                    collection(firestore, 'order_items'),
                    where('reportDate', '==', reportDate)
                );
                const snapshot = await getDocs(q);
                const fetchedItems = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Item));
                
                fetchedItems.sort((a, b) => {
                    const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime();
                    const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime();
                    return timeB - timeA;
                });
                
                setItems(fetchedItems);
            } catch (error) {
                console.error("Error fetching archived items:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, [firestore, reportDate]);

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    if (!items || items.length === 0) return <p className="text-center text-muted-foreground text-sm py-8 border-t mt-6">Nenhum detalhe de pedido encontrado para esta data.</p>;

    return (
        <div className="mt-8 border-t pt-6">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-primary" />
                Listagem de Pedidos Detalhada
            </h4>
            <div className="rounded-md border">
                <ItemList 
                    items={items} 
                    isLoading={false} 
                />
            </div>
        </div>
    );
};

const CustomerReportsSection = ({ bomboniereItems }: { bomboniereItems: BomboniereItem[] }) => {
    const firestore = useFirestore();
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [loading, setLoading] = useState(false);
    const [customerData, setCustomerData] = useState<{ name: string, total: number, count: number }[]>([]);

    const fetchCustomerStats = async () => {
        if (!firestore) return;
        setLoading(true);
        try {
            const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
            const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');

            const q = query(
                collection(firestore, 'order_items'),
                where('reportDate', '>=', start),
                where('reportDate', '<=', end)
            );
            
            const snapshot = await getDocs(q);
            const items = snapshot.docs.map(doc => doc.data() as Item);

            const stats: Record<string, { total: number, count: number }> = {};

            items.forEach(item => {
                if (item.customerName) {
                    const name = item.customerName.trim();
                    if (!stats[name]) {
                        stats[name] = { total: 0, count: 0 };
                    }
                    stats[name].total += item.total;
                    stats[name].count += 1;
                }
            });

            const sortedStats = Object.entries(stats)
                .map(([name, data]) => ({ name, ...data }))
                .sort((a, b) => b.total - a.total);

            setCustomerData(sortedStats);
        } catch (error) {
            console.error("Error fetching customer stats:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomerStats();
    }, [firestore, currentDate]);

    const generateYearOptions = () => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear; i >= currentYear - 5; i--) {
            years.push(i);
        }
        return years;
    }

    const monthOptions = Array.from({ length: 12 }, (_, i) => ({
        value: String(i),
        label: format(new Date(2000, i), 'MMMM', { locale: ptBR })
    }));

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-muted-foreground">Mês</label>
                    <Select
                        value={String(currentDate.getMonth())}
                        onValueChange={(value) => setCurrentDate(setMonth(new Date(currentDate), parseInt(value)))}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="text-sm font-medium text-muted-foreground">Ano</label>
                    <Select
                        value={String(currentDate.getFullYear())}
                        onValueChange={(value) => setCurrentDate(setYear(new Date(currentDate), parseInt(value)))}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {generateYearOptions().map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : customerData.length > 0 ? (
                <div className="rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="text-left p-4 font-medium">Cliente</th>
                                <th className="text-center p-4 font-medium">Pedidos</th>
                                <th className="text-right p-4 font-medium">Total Gasto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {customerData.map((cust, idx) => (
                                <tr key={cust.name} className="hover:bg-muted/30 transition-colors">
                                    <td className="p-4 flex items-center gap-2">
                                        <div className="bg-primary/10 text-primary p-1.5 rounded-full">
                                            <User className="h-4 w-4" />
                                        </div>
                                        <span className="font-semibold">{cust.name}</span>
                                    </td>
                                    <td className="p-4 text-center text-muted-foreground">{cust.count}</td>
                                    <td className="p-4 text-right font-mono font-bold text-primary">{formatCurrency(cust.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-20">
                        <User className="mx-auto h-8 w-8 mb-2 opacity-20"/>
                        <p>Nenhum consumo identificado para clientes identificados neste mês.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

const ReportDetail = ({ report, bomboniereItems }: { report: DailyReport | null, bomboniereItems: BomboniereItem[] }) => {
    
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
    
    if (!report) {
         return null;
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
    <div className="space-y-8 pt-4">
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
      <ArchivedItemsTable reportDate={report.reportDate} />
    </div>
  )
};

const aggregateReports = (reports: DailyReport[]): DailyReport | null => {
    if (!reports || reports.length === 0) return null;

    const initial: DailyReport = {
        id: String(reports.length),
        reportDate: '', createdAt: '', userId: '',
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
            acc.contagemTotal[key] = (acc.contagemTotal[key] || 0) + (report.contagemTotal[key] || 0);
        }
        for (const key in report.contagemRua) {
            acc.contagemRua[key] = (acc.contagemRua[key] || 0) + (report.contagemRua[key] || 0);
        }
        
        return acc;
    }, initial);
};

const DailyReportsSection = ({ reports, bomboniereItems, onDeleteRequest, onEditDateRequest }: { 
    reports: DailyReport[], 
    bomboniereItems: BomboniereItem[], 
    onDeleteRequest: (id: string) => void,
    onEditDateRequest: (report: DailyReport) => void 
}) => {
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const firestore = useFirestore();
    
    const monthlyReports = useMemo(() => {
        if(!reports) return [];
        return reports.filter(r => {
            const reportDate = parseISO(r.reportDate);
            return reportDate.getFullYear() === currentDate.getFullYear() && reportDate.getMonth() === currentDate.getMonth();
        }).sort((a, b) => parseISO(b.reportDate).getTime() - parseISO(a.reportDate).getTime());
    }, [reports, currentDate]);

    const generateYearOptions = () => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear; i >= currentYear - 5; i--) {
            years.push(i);
        }
        return years;
    }

    const monthOptions = Array.from({ length: 12 }, (_, i) => ({
        value: String(i),
        label: format(new Date(2000, i), 'MMMM', { locale: ptBR })
    }));

    return (
        <div className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="month-select-daily" className="text-sm font-medium text-muted-foreground">Mês</label>
                    <Select
                        value={String(currentDate.getMonth())}
                        onValueChange={(value) => setCurrentDate(setMonth(new Date(currentDate), parseInt(value)))}
                    >
                        <SelectTrigger id="month-select-daily" className="w-[180px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 <div>
                    <label htmlFor="year-select-daily" className="text-sm font-medium text-muted-foreground">Ano</label>
                    <Select
                        value={String(currentDate.getFullYear())}
                        onValueChange={(value) => setCurrentDate(setYear(new Date(currentDate), parseInt(value)))}
                    >
                        <SelectTrigger id="year-select-daily" className="w-[120px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {generateYearOptions().map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {monthlyReports.length > 0 ? (
                <Accordion type="single" collapsible className="w-full space-y-4">
                    {monthlyReports.map((report) => (
                        <AccordionItem key={report.id} value={report.id || ''}>
                            <Card>
                                 <AccordionTrigger className="p-4 w-full text-left hover:no-underline">
                                      <div className="flex justify-between items-center w-full">
                                          <div className="flex items-center gap-4">
                                              <div className="text-center">
                                                  <p className="text-2xl font-bold">{format(parseISO(report.reportDate), 'dd')}</p>
                                                  <p className="text-xs uppercase text-muted-foreground">{format(parseISO(report.reportDate), 'MMM', { locale: ptBR })}</p>
                                              </div>
                                              <div>
                                                  <p className="font-semibold text-base">{format(parseISO(report.reportDate), "EEEE", { locale: ptBR })}</p>
                                                  <p className="text-sm text-muted-foreground">{report.totalPedidos} pedidos</p>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              <div className="text-right">
                                                  <p className="text-sm text-muted-foreground">Total do Dia</p>
                                                  <p className="text-lg font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
                                              </div>
                                              <div
                                                  role="button"
                                                  aria-label="Alterar Data"
                                                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), "h-9 w-9 text-muted-foreground hover:text-primary z-10")}
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      if(report.id) onEditDateRequest(report);
                                                  }}
                                              >
                                                  <CalendarDays className="h-4 w-4" />
                                              </div>
                                              <div
                                                  role="button"
                                                  aria-label="Excluir Relatório"
                                                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), "h-9 w-9 text-muted-foreground hover:text-destructive z-10")}
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      if(report.id) onDeleteRequest(report.id);
                                                  }}
                                              >
                                                  <Trash2 className="h-4 w-4" />
                                              </div>
                                          </div>
                                      </div>
                                  </AccordionTrigger>
                                <AccordionContent className="p-4 pt-0">
                                    <ReportDetail report={report} bomboniereItems={bomboniereItems} />
                                </AccordionContent>
                            </Card>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-20">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum relatório encontrado para o mês de {format(currentDate, 'MMMM', { locale: ptBR })}.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

const WeeklyReportsSection = ({ reports, bomboniereItems }: { reports: DailyReport[], bomboniereItems: BomboniereItem[] }) => {
    const [year, setYear] = useState(new Date().getFullYear());

    const generateYearOptions = () => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear; i >= currentYear - 5; i--) {
            years.push(i);
        }
        return years;
    }

    const weeklyData = useMemo(() => {
        const yearReports = reports.filter(r => getYear(parseISO(r.reportDate)) === year);
        const weeks: Record<number, DailyReport[]> = {};
        for(const report of yearReports) {
            const weekNumber = getWeek(parseISO(report.reportDate), { weekStartsOn: 1 });
            if(!weeks[weekNumber]) weeks[weekNumber] = [];
            weeks[weekNumber].push(report);
        }
        return Object.entries(weeks).map(([week, weekReports]) => {
            const firstDay = startOfWeek(parseISO(weekReports[0].reportDate), { weekStartsOn: 1 });
            const lastDay = endOfWeek(parseISO(weekReports[0].reportDate), { weekStartsOn: 1 });
            return {
                weekNumber: Number(week),
                dateRange: `${format(firstDay, 'dd/MM')} - ${format(lastDay, 'dd/MM')}`,
                aggregated: aggregateReports(weekReports)
            }
        }).sort((a, b) => b.weekNumber - a.weekNumber);

    }, [reports, year]);

    return (
        <div className="space-y-4">
             <div className="w-full max-w-xs">
                <label htmlFor="year-select-weekly" className="text-sm font-medium text-muted-foreground">Ano</label>
                <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                    <SelectTrigger id="year-select-weekly"><SelectValue /></SelectTrigger>
                    <SelectContent>{generateYearOptions().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            {weeklyData.length > 0 ? (
                <Accordion type="single" collapsible className="w-full space-y-4">
                    {weeklyData.map(({ weekNumber, dateRange, aggregated }) => (
                        <AccordionItem key={weekNumber} value={String(weekNumber)}>
                             <Card>
                                <AccordionTrigger className="p-4 text-left hover:no-underline">
                                    <div className="flex justify-between items-center w-full">
                                        <div>
                                            <p className="font-semibold text-base">Semana {weekNumber}</p>
                                            <p className="text-sm text-muted-foreground">{dateRange}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-muted-foreground">Total da Semana</p>
                                            <p className="text-lg font-bold text-primary">{formatCurrency(aggregated?.totalGeral)}</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-4 pt-0">
                                    <ReportDetail report={aggregated} bomboniereItems={bomboniereItems} />
                                </AccordionContent>
                             </Card>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-20">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum relatório encontrado para {year}.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

const MonthlyReportsSection = ({ reports, bomboniereItems }: { reports: DailyReport[], bomboniereItems: BomboniereItem[] }) => {
    const [year, setYear] = useState(new Date().getFullYear());

    const generateYearOptions = () => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear; i >= currentYear - 5; i--) {
            years.push(i);
        }
        return years;
    }

    const monthlyData = useMemo(() => {
        const yearReports = reports.filter(r => getYear(parseISO(r.reportDate)) === year);
        const months: Record<number, DailyReport[]> = {};
        for(const report of yearReports) {
            const monthNumber = getMonth(parseISO(report.reportDate));
            if(!months[monthNumber]) months[monthNumber] = [];
            months[monthNumber].push(report);
        }
        return Object.entries(months).map(([month, monthReports]) => ({
            monthNumber: Number(month),
            monthName: format(new Date(year, Number(month)), 'MMMM', { locale: ptBR }),
            aggregated: aggregateReports(monthReports)
        })).sort((a,b) => b.monthNumber - a.monthNumber);
    }, [reports, year]);

     return (
        <div className="space-y-4">
            <div className="w-full max-w-xs">
                <label htmlFor="year-select-monthly" className="text-sm font-medium text-muted-foreground">Ano</label>
                <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                    <SelectTrigger id="year-select-monthly"><SelectValue /></SelectTrigger>
                    <SelectContent>{generateYearOptions().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            {monthlyData.length > 0 ? (
                <Accordion type="single" collapsible className="w-full space-y-4">
                    {monthlyData.map(({ monthNumber, monthName, aggregated }) => (
                        <AccordionItem key={monthNumber} value={String(monthNumber)}>
                             <Card>
                                <AccordionTrigger className="p-4 text-left hover:no-underline">
                                    <div className="flex justify-between items-center w-full">
                                        <p className="font-semibold text-base capitalize">{monthName}</p>
                                        <div className="text-right">
                                            <p className="text-sm text-muted-foreground">Total do Mês</p>
                                            <p className="text-lg font-bold text-primary">{formatCurrency(aggregated?.totalGeral)}</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-4 pt-0">
                                    <ReportDetail report={aggregated} bomboniereItems={bomboniereItems} />
                                </AccordionContent>
                             </Card>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-20">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum relatório encontrado para {year}.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

const YearlyReportsSection = ({ reports, bomboniereItems }: { reports: DailyReport[], bomboniereItems: BomboniereItem[] }) => {
    const yearlyData = useMemo(() => {
        const years: Record<number, DailyReport[]> = {};
        for(const report of reports) {
            const yearNumber = getYear(parseISO(report.reportDate));
            if(!years[yearNumber]) years[yearNumber] = [];
            years[yearNumber].push(report);
        }
        return Object.entries(years).map(([year, yearReports]) => ({
            yearNumber: Number(year),
            aggregated: aggregateReports(yearReports)
        })).sort((a,b) => b.yearNumber - a.yearNumber);
    }, [reports]);

    return (
        <div className="space-y-4">
            {yearlyData.length > 0 ? (
                <Accordion type="single" collapsible className="w-full space-y-4">
                    {yearlyData.map(({ yearNumber, aggregated }) => (
                        <AccordionItem key={yearNumber} value={String(yearNumber)}>
                             <Card>
                                <AccordionTrigger className="p-4 text-left hover:no-underline">
                                    <div className="flex justify-between items-center w-full">
                                        <p className="font-semibold text-base">{yearNumber}</p>
                                        <div className="text-right">
                                            <p className="text-sm text-muted-foreground">Total do Ano</p>
                                            <p className="text-lg font-bold text-primary">{formatCurrency(aggregated?.totalGeral)}</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-4 pt-0">
                                    <ReportDetail report={aggregated} bomboniereItems={bomboniereItems} />
                                </AccordionContent>
                             </Card>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-20">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum relatório encontrado.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

const GeneralReportSection = ({ reports, bomboniereItems }: { reports: DailyReport[], bomboniereItems: BomboniereItem[] }) => {
    const generalReport = useMemo(() => aggregateReports(reports), [reports]);
    return (
        <div className="space-y-4">
            {generalReport ? (
                 <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Relatório Geral Acumulado</CardTitle>
                                <CardDescription>Resumo de todas as vendas registadas na aplicação.</CardDescription>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-muted-foreground">Total Acumulado</p>
                                <p className="text-2xl font-bold text-primary">{formatCurrency(generalReport?.totalGeral)}</p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ReportDetail report={generalReport} bomboniereItems={bomboniereItems} />
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-20">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum relatório encontrado.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
};


function ReportsPageContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [reportToDelete, setReportToDelete] = useState<DailyReport | null>(null);
  const [reportToEditDate, setReportToEditDate] = useState<DailyReport | null>(null);
  const [newReportDate, setNewReportDate] = useState<Date | undefined>();
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  
  const allReportsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'daily_reports'), orderBy('reportDate', 'desc'));
  }, [firestore]);

  const { data: allReports, isLoading: isLoadingReports } = useCollection<DailyReport>(allReportsQuery);

  const bomboniereQuery = useMemo(
    () => firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null,
    [firestore]
  );
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereQuery);

  const { isUserLoading } = useUser();

  const isLoading = isLoadingReports || isLoadingBomboniere || isUserLoading;

  const handleDeleteReportRequest = (reportId: string) => {
    const report = allReports?.find(r => r.id === reportId);
    if(report) {
        setReportToDelete(report);
    }
  };
  
  const handleEditDateRequest = (report: DailyReport) => {
    setReportToEditDate(report);
    setNewReportDate(parseISO(report.reportDate));
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

        orderItemsSnapshot.forEach(orderDoc => {
            const item = orderDoc.data();
            const liveItemRef = doc(collection(firestore, 'live_items'), orderDoc.id);
            batch.set(liveItemRef, { ...item, reportado: false });
            batch.delete(orderDoc.ref);
        });
        
        const reportDocRef = doc(firestore, "daily_reports", reportToDelete.id);
        batch.delete(reportDocRef);

        await batch.commit();
        
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
  
  const confirmEditDate = async () => {
    if (!firestore || !reportToEditDate || !newReportDate) return;

    setIsUpdatingDate(true);
    const oldDateStr = reportToEditDate.reportDate;
    const newDateStr = format(newReportDate, 'yyyy-MM-dd');

    if (oldDateStr === newDateStr) {
        toast({ title: "Nenhuma alteração", description: "A data selecionada é a mesma que a data atual." });
        setIsUpdatingDate(false);
        setReportToEditDate(null);
        return;
    }

    try {
        const batch = writeBatch(firestore);

        const reportDocRef = doc(firestore, "daily_reports", reportToEditDate.id!);
        batch.update(reportDocRef, { reportDate: newDateStr });

        const orderItemsQuery = query(
          collection(firestore, 'order_items'), 
          where('reportDate', '==', oldDateStr)
        );
        const orderItemsSnapshot = await getDocs(orderItemsQuery);

        orderItemsSnapshot.forEach(orderDoc => {
            batch.update(orderDoc.ref, { reportDate: newDateStr });
        });

        await batch.commit();
        
        toast({
            title: "Sucesso!",
            description: `A data do relatório foi alterada para ${format(newReportDate, 'dd/MM/yyyy', { locale: ptBR })}.`,
        });

    } catch (error: any) {
        console.error("Error updating report date:", error);
        toast({
            variant: "destructive",
            title: "Erro",
            description: error.message || "Não foi possível alterar a data do relatório.",
        });
    } finally {
        setIsUpdatingDate(false);
        setReportToEditDate(null);
        setNewReportDate(undefined);
    }
  };
  
  if (isLoading && !allReports) {
    return (
      <div className="flex h-64 items-center justify-center">
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
      
      <Dialog open={!!reportToEditDate} onOpenChange={(open) => { if (!open) setReportToEditDate(null)}}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Alterar Data do Relatório</DialogTitle>
                <DialogDescription>
                    Selecione a nova data para o relatório de <span className="font-bold">{reportToEditDate ? format(parseISO(reportToEditDate.reportDate), 'dd/MM/yyyy', { locale: ptBR }) : ''}</span>. 
                    Isto também atualizará a data de todos os itens de pedido arquivados neste relatório.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 flex justify-center">
                <Calendar
                  mode="single"
                  selected={newReportDate}
                  onSelect={setNewReportDate}
                  initialFocus
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setReportToEditDate(null)}>Cancelar</Button>
                <Button onClick={confirmEditDate} disabled={isUpdatingDate || !newReportDate}>
                    {isUpdatingDate ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : 'Confirmar Alteração'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <main className="space-y-6">
        <Accordion type="single" collapsible defaultValue="diario" className="w-full space-y-4">
            
            <AccordionItem value="diario">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline">
                        <div className="flex items-center gap-3">
                            <CalendarDays className="h-6 w-6 text-primary"/>
                            <span>Relatórios Diários</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                       <DailyReportsSection reports={allReports || []} bomboniereItems={bomboniereItems || []} onDeleteRequest={handleDeleteReportRequest} onEditDateRequest={handleEditDateRequest} />
                    </AccordionContent>
                </Card>
            </AccordionItem>

            <AccordionItem value="semanal">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline">
                         <div className="flex items-center gap-3">
                            <BarChart4 className="h-6 w-6 text-primary"/>
                            <span>Relatórios Semanais</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        <WeeklyReportsSection reports={allReports || []} bomboniereItems={bomboniereItems || []} />
                    </AccordionContent>
                </Card>
            </AccordionItem>

            <AccordionItem value="mensal">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline">
                         <div className="flex items-center gap-3">
                            <AreaChart className="h-6 w-6 text-primary"/>
                            <span>Relatórios Mensais</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        <MonthlyReportsSection reports={allReports || []} bomboniereItems={bomboniereItems || []} />
                    </AccordionContent>
                </Card>
            </AccordionItem>

             <AccordionItem value="anual">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline">
                         <div className="flex items-center gap-3">
                            <LineChart className="h-6 w-6 text-primary"/>
                            <span>Relatórios Anuais</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        <YearlyReportsSection reports={allReports || []} bomboniereItems={bomboniereItems || []} />
                    </AccordionContent>
                </Card>
            </AccordionItem>

            <AccordionItem value="geral">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline">
                         <div className="flex items-center gap-3">
                            <GanttChart className="h-6 w-6 text-primary"/>
                            <span>Relatório Geral</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        <GeneralReportSection reports={allReports || []} bomboniereItems={bomboniereItems || []} />
                    </AccordionContent>
                </Card>
            </AccordionItem>

            <AccordionItem value="clientes">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline">
                         <div className="flex items-center gap-3">
                            <User className="h-6 w-6 text-primary"/>
                            <span>Consumo por Cliente (Mensal)</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        <CustomerReportsSection bomboniereItems={bomboniereItems || []} />
                    </AccordionContent>
                </Card>
            </AccordionItem>

        </Accordion>
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
