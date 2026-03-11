
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { 
    collection, 
    query, 
    doc, 
    where, 
    getDocs, 
    deleteDoc, 
    writeBatch, 
    setDoc, 
    addDoc, 
    Timestamp 
} from 'firebase/firestore';
import { 
    format, 
    parseISO, 
    startOfWeek, 
    endOfWeek, 
    startOfMonth, 
    endOfMonth, 
    getYear, 
    getMonth,
    setYear,
    setMonth,
    isValid,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
    Loader2, 
    Trash2, 
    Info, 
    CalendarDays, 
    BarChart4, 
    AreaChart, 
    LineChart, 
    GanttChart, 
    ListOrdered, 
    User, 
    Eye, 
    Calendar as CalendarIcon, 
    Clock, 
    Pencil, 
    Plus 
} from 'lucide-react';
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
import type { 
    DailyReport, 
    ItemCount, 
    BomboniereItem, 
    Item, 
    Group, 
    PredefinedItem, 
    SelectedBomboniereItem, 
    SavedFavorite 
} from '@/types';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell } from 'recharts';
import ItemList from '@/components/item-list';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp-icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import usePersistentState from '@/hooks/use-persistent-state';
import { PREDEFINED_PRICES, DELIVERY_FEE } from '@/lib/constants';
import FavoritesMenu from '@/components/favorites-menu';
import BomboniereModal from '@/components/bomboniere-modal';
import { Calendar } from '@/components/ui/calendar';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const isNumeric = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);

const safeFormat = (dateInput: any, formatStr: string, options?: any) => {
    if (!dateInput) return '-';
    let d: Date;
    if (dateInput instanceof Date) {
        d = dateInput;
    } else if (dateInput?.toDate) {
        d = dateInput.toDate();
    } else {
        d = new Date(dateInput);
    }
    
    if (!isValid(d)) return '-';
    return format(d, formatStr, options);
};

const ArchivedItemsTable = ({ 
    reportDate, 
    onEdit, 
    onDelete, 
    onAdd 
}: { 
    reportDate: string, 
    onEdit: (item: Item) => void, 
    onDelete: (item: Item) => void,
    onAdd: () => void
}) => {
    const firestore = useFirestore();
    
    const archivedItemsQuery = useMemo(() => {
        if (!firestore || !reportDate) return null;
        return query(
            collection(firestore, 'order_items'),
            where('reportDate', '==', reportDate)
        );
    }, [firestore, reportDate]);

    const { data: rawItems, isLoading } = useCollection<Item>(archivedItemsQuery);

    const sortedItems = useMemo(() => {
        if (!rawItems) return [];
        return [...rawItems].sort((a, b) => {
            const getT = (ts: any) => {
                if (!ts) return 0;
                if (ts.toMillis) return ts.toMillis();
                const d = new Date(ts);
                return isNaN(d.getTime()) ? 0 : d.getTime();
            };
            return getT(a.timestamp) - getT(b.timestamp);
        });
    }, [rawItems]);

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    
    if (!sortedItems || sortedItems.length === 0) return (
        <div className="mt-8 border-t pt-6 text-center">
             <p className="text-muted-foreground text-sm py-4">Nenhum pedido encontrado.</p>
             <Button variant="outline" size="sm" onClick={onAdd}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar Item
             </Button>
        </div>
    );

    return (
        <div className="mt-8 border-t pt-6">
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold flex items-center gap-2">
                    <ListOrdered className="h-5 w-5 text-primary" />
                    Listagem de Pedidos Detalhada
                </h4>
                <Button variant="outline" size="sm" onClick={onAdd}>
                    <Plus className="h-4 w-4 mr-2" /> Novo Item
                </Button>
            </div>
            <div className="rounded-md border">
                <ItemList 
                    items={sortedItems} 
                    isLoading={false} 
                    onEdit={onEdit}
                    onDelete={(id) => {
                        const item = sortedItems.find(it => it.id === id);
                        if (item) onDelete(item);
                    }}
                />
            </div>
        </div>
    );
};

const CustomerReportsSection = ({ 
    bomboniereItems,
    onEditItem,
    onDeleteItem
}: { 
    bomboniereItems: BomboniereItem[],
    onEditItem: (item: Item) => void,
    onDeleteItem: (item: Item) => void
}) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);

    const orderItemsQuery = useMemo(() => {
        if (!firestore) return null;
        const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
        const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');
        return query(
            collection(firestore, 'order_items'),
            where('reportDate', '>=', start),
            where('reportDate', '<=', end)
        );
    }, [firestore, currentDate]);

    const { data: items, isLoading } = useCollection<Item>(orderItemsQuery);

    const customerData = useMemo(() => {
        if (!items) return [];
        
        const stats: Record<string, { name: string, total: number, count: number, orders: Item[] }> = {};

        items.forEach(item => {
            if (item.customerName) {
                const rawName = item.customerName.trim();
                const key = rawName.toLowerCase();
                
                if (!stats[key]) {
                    stats[key] = { name: rawName, total: 0, count: 0, orders: [] };
                }
                stats[key].total += item.total;
                stats[key].count += 1;
                stats[key].orders.push(item);
            }
        });

        return Object.values(stats)
            .map((data) => {
                data.orders.sort((a, b) => {
                    const getT = (ts: any) => {
                        if (!ts) return 0;
                        if (ts.toMillis) return ts.toMillis();
                        const d = new Date(ts);
                        return isNaN(d.getTime()) ? 0 : d.getTime();
                    };
                    return getT(a.timestamp) - getT(b.timestamp);
                });
                return data;
            })
            .sort((a, b) => b.total - a.total);
    }, [items]);

    const selectedCustomer = useMemo(() => {
        if (!selectedCustomerName) return null;
        return customerData.find(c => c.name.toLowerCase() === selectedCustomerName.toLowerCase()) || null;
    }, [customerData, selectedCustomerName]);

    const handleCopyIndividualToWhatsApp = (customer: { name: string, orders: Item[] }) => {
        const monthName = safeFormat(currentDate, 'MMM/yy', { locale: ptBR }).toUpperCase();
        let message = `*📊 EXTRATO ${monthName} - ${customer.name.toUpperCase()}*\n`;

        customer.orders.forEach((order) => {
            const time = safeFormat(order.timestamp, 'dd/MM HH:mm');
            message += `•${time}:*${formatCurrency(order.total).replace(/\s/g, '')}*(${order.name.substring(0, 20)})\n`;
        });

        const total = customer.orders.reduce((acc, o) => acc + o.total, 0);
        message += `*TOTAL:${formatCurrency(total).replace(/\s/g, '')}*`;

        navigator.clipboard.writeText(message).then(() => {
            toast({
                title: "Extrato Copiado!",
                description: `O extrato compacto de ${customer.name} foi copiado.`,
            });
        });
    };

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
            <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomerName(null)}>
                <DialogContent className="max-w-md sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <div className="flex items-center justify-between pr-6">
                            <div className="flex items-center gap-2">
                                <User className="h-5 w-5 text-primary" />
                                <DialogTitle>Histórico de {selectedCustomer?.name}</DialogTitle>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm"
                                className="flex items-center gap-2 border-green-500/50 text-green-500 hover:bg-green-500/10"
                                onClick={() => selectedCustomer && handleCopyIndividualToWhatsApp(selectedCustomer)}
                            >
                                <WhatsAppIcon className="h-4 w-4" />
                                <span>WhatsApp</span>
                            </Button>
                        </div>
                        <DialogDescription>
                            Listagem dos pedidos em {safeFormat(currentDate, 'MMMM yyyy', { locale: ptBR })}.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <ScrollArea className="max-h-[60vh] pr-4 mt-4">
                        <div className="space-y-3">
                            {selectedCustomer?.orders.map((order, idx) => (
                                <div key={order.id || idx} className="flex justify-between items-center p-3 rounded-lg border bg-muted/30 group">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-background p-2 rounded-md border text-center min-w-[50px]">
                                            <p className="text-[0.6rem] font-bold uppercase text-muted-foreground leading-none">
                                                {safeFormat(order.timestamp, 'MMM', { locale: ptBR })}
                                            </p>
                                            <p className="text-lg font-bold leading-tight">
                                                {safeFormat(order.timestamp, 'dd')}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[0.65rem] font-medium text-muted-foreground">
                                                {safeFormat(order.timestamp, 'EEEE, HH:mm', { locale: ptBR })}
                                            </p>
                                            <p className="text-sm font-semibold truncate max-w-[150px] sm:max-w-[300px]">{order.name}</p>
                                            <Badge variant="outline" className="text-[0.6rem] h-4 mt-1">{order.group}</Badge>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-sm font-mono font-bold text-primary">{formatCurrency(order.total)}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                                                onClick={() => onEditItem(order)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => onDeleteItem(order)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>

                    <DialogFooter className="mt-4">
                        <div className="flex justify-between items-center w-full">
                            <div className="text-sm">
                                <span className="text-muted-foreground">Total Acumulado:</span>
                                <span className="ml-2 font-bold text-primary text-lg">
                                    {formatCurrency(selectedCustomer?.orders.reduce((acc, o) => acc + o.total, 0))}
                                </span>
                            </div>
                            <Button variant="outline" onClick={() => setSelectedCustomerName(null)}>Fechar</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="grid grid-cols-2 gap-4 flex-grow">
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
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : customerData.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="text-left p-4 font-medium">Cliente</th>
                                <th className="text-center p-4 font-medium">Pedidos</th>
                                <th className="text-right p-4 font-medium">Total Gasto</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {customerData.map((cust, idx) => (
                                <tr 
                                    key={cust.name} 
                                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedCustomerName(cust.name)}
                                >
                                    <td className="p-4 flex items-center gap-2">
                                        <div className="bg-primary/10 text-primary p-1.5 rounded-full">
                                            <User className="h-4 w-4" />
                                        </div>
                                        <span className="font-semibold">{cust.name}</span>
                                    </td>
                                    <td className="p-4 text-center text-muted-foreground">{cust.count}</td>
                                    <td className="p-4 text-right font-mono font-bold text-primary">{formatCurrency(cust.total)}</td>
                                    <td className="pr-4 text-right">
                                        <Eye className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </td>
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

const ReportDetail = ({ 
    report, 
    bomboniereItems, 
    onEditItem,
    onDeleteItem,
    onAddItem
}: { 
    report: DailyReport | null, 
    bomboniereItems: BomboniereItem[],
    onEditItem: (item: Item) => void,
    onDeleteItem: (item: Item) => void,
    onAddItem: (reportDate: string) => void
}) => {
    
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
    
    if (!report) return null;

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
        const { lanches: lanchesRua } = separateItemsByCategory(contagemRua);
        const { bomboniere: bomboniereRua } = separateItemsByCategory(contagemRua);
        
        return { lanchesSalao, bomboniereSalao, lanchesRua, bomboniereRua };
    }, [report.contagemTotal, report.contagemRua, separateItemsByCategory]);

    const renderItemCountList = (counts: ItemCount) => {
      if (!counts || Object.keys(counts).length === 0) return null;

      const sortedEntries = Object.entries(counts).sort(([, aCount], [, bCount]) => bCount - aCount);

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
      if (!counts || Object.keys(counts).length === 0) return null;
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
              </ChartContainer>
          </div>
        </div>
      </div>
      <ArchivedItemsTable 
        reportDate={report.reportDate} 
        onEdit={onEditItem} 
        onDelete={onDeleteItem}
        onAdd={() => onAddItem(report.reportDate)}
      />
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

const DailyReportsSection = ({ 
    reports, 
    bomboniereItems, 
    onDeleteRequest, 
    onEditDateRequest,
    onEditItem,
    onDeleteItem,
    onAddItem
}: { 
    reports: DailyReport[], 
    bomboniereItems: BomboniereItem[], 
    onDeleteRequest: (id: string) => void,
    onEditDateRequest: (report: DailyReport) => void,
    onEditItem: (item: Item) => void,
    onDeleteItem: (item: Item) => void,
    onAddItem: (reportDate: string) => void
}) => {
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    
    const monthlyReports = useMemo(() => {
        if(!reports) return [];
        return reports.filter(r => {
            if (!r.reportDate) return false;
            const reportDate = parseISO(r.reportDate);
            return reportDate.getFullYear() === currentDate.getFullYear() && reportDate.getMonth() === currentDate.getMonth();
        }).sort((a, b) => a.reportDate.localeCompare(b.reportDate)); 
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
                        <SelectTrigger id="month-select-daily" className="w-full">
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
                        <SelectTrigger id="year-select-daily" className="w-full">
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
                                                  <p className="text-2xl font-bold">{safeFormat(parseISO(report.reportDate), 'dd')}</p>
                                                  <p className="text-[0.6rem] uppercase text-muted-foreground">{safeFormat(parseISO(report.reportDate), 'MMM', { locale: ptBR })}</p>
                                              </div>
                                              <div>
                                                  <p className="font-semibold text-base">{safeFormat(parseISO(report.reportDate), "EEEE", { locale: ptBR })}</p>
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
                                    <ReportDetail 
                                        report={report} 
                                        bomboniereItems={bomboniereItems} 
                                        onEditItem={onEditItem}
                                        onDeleteItem={onDeleteItem}
                                        onAddItem={onAddItem}
                                    />
                                </AccordionContent>
                            </Card>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-20">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum relatório encontrado para o mês de {safeFormat(currentDate, 'MMMM', { locale: ptBR })}.</p>
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
        const yearReports = reports.filter(r => r.reportDate && getYear(parseISO(r.reportDate)) === year);
        const weeks: Record<number, DailyReport[]> = {};
        for(const report of yearReports) {
            const weekNumber = format(parseISO(report.reportDate), 'w', { locale: ptBR });
            const weekNum = Number(weekNumber);
            if(!weeks[weekNum]) weeks[weekNum] = [];
            weeks[weekNum].push(report);
        }
        return Object.entries(weeks).map(([week, weekReports]) => {
            const firstDay = startOfWeek(parseISO(weekReports[0].reportDate), { weekStartsOn: 1 });
            const lastDay = endOfWeek(parseISO(weekReports[0].reportDate), { weekStartsOn: 1 });
            return {
                weekNumber: Number(week),
                dateRange: `${safeFormat(firstDay, 'dd/MM')} - ${safeFormat(lastDay, 'dd/MM')}`,
                aggregated: aggregateReports(weekReports)
            }
        }).sort((a, b) => a.weekNumber - b.weekNumber);

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
                                    <ReportDetail 
                                        report={aggregated} 
                                        bomboniereItems={bomboniereItems} 
                                        onEditItem={() => {}} 
                                        onDeleteItem={() => {}} 
                                        onAddItem={() => {}}
                                    />
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
        const yearReports = reports.filter(r => r.reportDate && getYear(parseISO(r.reportDate)) === year);
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
        })).sort((a,b) => a.monthNumber - b.monthNumber);
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
                                    <ReportDetail 
                                        report={aggregated} 
                                        bomboniereItems={bomboniereItems} 
                                        onEditItem={() => {}} 
                                        onDeleteItem={() => {}} 
                                        onAddItem={() => {}}
                                    />
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
            if (!report.reportDate) continue;
            const yearNumber = getYear(parseISO(report.reportDate));
            if(!years[yearNumber]) years[yearNumber] = [];
            years[yearNumber].push(report);
        }
        return Object.entries(years).map(([year, yearReports]) => ({
            yearNumber: Number(year),
            aggregated: aggregateReports(yearReports)
        })).sort((a,b) => a.yearNumber - b.yearNumber);
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
                                    <ReportDetail 
                                        report={aggregated} 
                                        bomboniereItems={bomboniereItems} 
                                        onEditItem={() => {}} 
                                        onDeleteItem={() => {}} 
                                        onAddItem={() => {}}
                                    />
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
                        <ReportDetail 
                            report={generalReport} 
                            bomboniereItems={bomboniereItems} 
                            onEditItem={() => {}} 
                            onDeleteItem={() => {}} 
                            onAddItem={() => {}}
                        />
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
  const { user, isUserLoading } = useUser();
  
  const [reportToDelete, setReportToDelete] = useState<DailyReport | null>(null);
  const [reportToEditDate, setReportToEditDate] = useState<DailyReport | null>(null);
  const [newReportDate, setNewReportDate] = useState<Date | undefined>();
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);

  const [archivedItemToDelete, setArchivedItemToDelete] = useState<Item | null>(null);
  const [archivedItemToEdit, setArchivedItemToEdit] = useState<Item | null>(null);
  const [editArchivedInput, setEditArchivedInput] = useState('');
  
  const [editArchivedDate, setEditArchivedDate] = useState<Date | undefined>();
  const [editArchivedTime, setEditArchivedTime] = useState('12:00');
  
  const [isProcessingEdit, setIsProcessingEdit] = useState(false);
  const [activeReportDateForAdd, setActiveReportDateForAdd] = useState<string | null>(null);
  
  const [savedFavorites, setSavedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);
  const [isBomboniereModalOpen, setIsBomboniereModalOpen] = useState(false);

  const [predefinedPrices] = usePersistentState('predefinedPrices', PREDEFINED_PRICES);
  const [deliveryFee] = usePersistentState('deliveryFee', DELIVERY_FEE);
  
  const allReportsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'daily_reports'));
  }, [firestore]);

  const { data: allReportsRaw, isLoading: isLoadingReports } = useCollection<DailyReport>(allReportsQuery);

  const allReports = useMemo(() => {
    if (!allReportsRaw) return [];
    return [...allReportsRaw]
      .filter(r => r && typeof r.reportDate === 'string') 
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  }, [allReportsRaw]);

  const bomboniereQuery = useMemo(
    () => firestore ? query(collection(firestore, 'bomboniere_items')) : null,
    [firestore]
  );
  const { data: bomboniereItems } = useCollection<BomboniereItem>(bomboniereQuery);

  const bomboniereItemsByName = useMemo(() => {
    if (!bomboniereItems) return {};
    return bomboniereItems.reduce((acc, item) => {
        acc[item.name.toLowerCase()] = item;
        return acc;
    }, {} as Record<string, BomboniereItem>);
  }, [bomboniereItems]);

  const isLoading = isLoadingReports || isUserLoading;

  useEffect(() => {
    if (archivedItemToEdit) {
        setEditArchivedInput(archivedItemToEdit.originalCommand || '');
        let itemDate: Date;
        if (archivedItemToEdit.timestamp?.toDate) {
            itemDate = archivedItemToEdit.timestamp.toDate();
        } else {
            itemDate = new Date(archivedItemToEdit.timestamp);
        }
        
        if (isValid(itemDate)) {
            setEditArchivedDate(itemDate);
            setEditArchivedTime(format(itemDate, 'HH:mm'));
        } else {
            setEditArchivedDate(new Date());
            setEditArchivedTime('12:00');
        }
    }
  }, [archivedItemToEdit]);

  const recalculateReport = async (reportDate: string) => {
    if (!firestore || !user?.uid) return;

    try {
        const orderItemsQuery = query(
            collection(firestore, 'order_items'),
            where('reportDate', '==', reportDate)
        );
        const snapshot = await getDocs(orderItemsQuery);
        const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Item));

        const reportSnapshot = await getDocs(query(collection(firestore, 'daily_reports'), where('reportDate', '==', reportDate)));
        
        const totals = items.reduce(
            (acc, item) => {
                acc.totalGeral += item.total;
                acc.totalItens += item.quantity;
                acc.totalTaxas += item.deliveryFee;

                const itemIsRua = item.group === 'Vendas rua' || item.group === 'Fiados rua';
                if (itemIsRua) {
                    if (item.deliveryFee > 0) acc.totalEntregas++;
                    acc.totalItensRua += item.quantity;
                }

                if (item.group === 'Fiados salão' || item.group === 'Fiados rua') {
                    acc.totalFiado += item.total;
                } else {
                    acc.totalAVista += item.total;
                }

                switch (item.group) {
                    case 'Vendas salão': acc.totalVendasSalao += item.total; break;
                    case 'Vendas rua': acc.totalVendasRua += item.total; break;
                    case 'Fiados salão': acc.totalFiadoSalao += item.total; break;
                    case 'Fiados rua': acc.totalFiadoRua += item.total; break;
                }

                const itemsToCount = [
                    ...(item.predefinedItems?.map((i) => ({ ...i, count: 1 })) || []),
                    ...(item.bomboniereItems?.map((i) => ({ name: i.name, count: i.quantity })) || []),
                    ...(item.individualPrices?.map(() => ({ name: 'KG', count: 1 })) || []),
                ];

                itemsToCount.forEach(({ name, count }) => {
                    acc.contagemTotal[name] = (acc.contagemTotal[name] || 0) + count;
                    if (itemIsRua) {
                        acc.contagemRua[name] = (acc.contagemRua[name] || 0) + count;
                    }
                });

                const bomboniereTotal = item.bomboniereItems?.reduce((sum, bi) => sum + bi.price * bi.quantity, 0) || 0;
                if (itemIsRua) {
                    acc.totalBomboniereRua += bomboniereTotal;
                } else {
                    acc.totalBomboniereSalao += bomboniereTotal;
                }

                return acc;
            },
            {
                totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0, totalVendasRua: 0,
                totalFiadoSalao: 0, totalFiadoRua: 0, totalKg: 0, totalTaxas: 0, totalBomboniereSalao: 0,
                totalBomboniereRua: 0, totalItens: 0, totalPedidos: 0, totalEntregas: 0, totalItensRua: 0,
                contagemTotal: {} as ItemCount, contagemRua: {} as ItemCount,
            }
        );

        if (items.length === 0) {
            if (!reportSnapshot.empty) {
                await deleteDoc(reportSnapshot.docs[0].ref);
            }
            return;
        }

        if (!reportSnapshot.empty) {
            const reportRef = reportSnapshot.docs[0].ref;
            await setDoc(reportRef, {
                ...totals,
                totalPedidos: items.length,
                reportDate,
                userId: user.uid,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } else {
            await addDoc(collection(firestore, 'daily_reports'), {
                ...totals,
                totalPedidos: items.length,
                reportDate,
                userId: user.uid,
                createdAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        console.error("Error recalculating report:", error);
    }
  };

  const handleUpsertArchivedItem = async (rawInput: string, currentItem?: Item | null, specificDate?: string, favoriteName?: string) => {
    if (!firestore || !user?.uid || !editArchivedDate) return;
    setIsProcessingEdit(true);

    const oldReportDate = currentItem?.reportDate;
    
    const [hours, minutes] = editArchivedTime.split(':').map(Number);
    const finalDate = new Date(editArchivedDate);
    finalDate.setHours(hours, minutes, 0, 0);
    
    if (!isValid(finalDate)) {
        toast({ variant: 'destructive', title: 'Data Inválida', description: 'Por favor, selecione uma data e hora válidas.' });
        setIsProcessingEdit(false);
        return;
    }

    const newReportDateStr = format(finalDate, 'yyyy-MM-dd');

    try {
        const batch = writeBatch(firestore);

        if (currentItem && currentItem.bomboniereItems && currentItem.bomboniereItems.length > 0 && bomboniereItems) {
            for (const oldSoldItem of currentItem.bomboniereItems) {
                const itemDef = bomboniereItems.find((i) => i.id === oldSoldItem.id);
                if (itemDef) {
                    batch.update(doc(firestore, 'bomboniere_items', itemDef.id), { estoque: itemDef.estoque + oldSoldItem.quantity });
                }
            }
        }

        let mainInput = rawInput.trim();
        let group: Group = 'Vendas salão';
        let deliveryFeeApplicable = false;
        let isTaxExempt = false;
        let customerName = favoriteName || '';

        const partsEx = mainInput.split(' ').filter(p => p.trim() !== '');
        if (partsEx.some(p => p.toUpperCase() === 'E')) {
            isTaxExempt = true;
            mainInput = partsEx.filter(p => p.toUpperCase() !== 'E').join(' ');
        }

        const up = mainInput.toUpperCase();
        if (up.startsWith('R ')) { group = 'Vendas rua'; deliveryFeeApplicable = true; mainInput = mainInput.substring(2).trim(); }
        else if (up.startsWith('FR ')) { group = 'Fiados rua'; deliveryFeeApplicable = true; mainInput = mainInput.substring(3).trim(); }
        else if (up.startsWith('F ')) { group = 'Fiados salão'; mainInput = mainInput.substring(2).trim(); }

        let parts = mainInput.split(' ').filter(p => p.trim() !== '');
        let consumed = new Array(parts.length).fill(false);
        let totalQty = 0;
        let totalPrice = 0;
        let individualPrices: number[] = []; let predefinedItems: PredefinedItem[] = []; let procBomboniere: SelectedBomboniereItem[] = []; let customFee: number | null = null; let addFeeToTotal = true;

        for (let i = 0; i < parts.length; i++) {
            if (consumed[i]) continue;
            let bestMatch = null; let bestEnd = -1;
            for (let j = parts.length; j > i; j--) {
                const pot = parts.slice(i, j).join(' ').toLowerCase();
                if (bomboniereItemsByName[pot]) { bestMatch = bomboniereItemsByName[pot]; bestEnd = j; break; }
            }
            if (bestMatch) {
                let bomboniereQty = 1;
                if (i > 0 && !consumed[i - 1] && isNumeric(parts[i - 1])) { bomboniereQty = parseInt(parts[i - 1], 10); consumed[i - 1] = true; }
                let priceToUse = bestMatch.price;
                if (bestEnd < parts.length && !consumed[bestEnd] && isNumeric(parts[bestEnd])) { priceToUse = parseFloat(bestEnd < parts.length ? parts[bestEnd].replace(',', '.') : '0'); consumed[bestEnd] = true; }
                procBomboniere.push({ id: bestMatch.id, name: bestMatch.name, quantity: bomboniereQty, price: priceToUse });
                totalPrice += priceToUse * bomboniereQty; totalQty += bomboniereQty;
                for (let k = i; k < bestEnd; k++) consumed[k] = true;
                i = bestEnd - 1;
            }
        }

        for (let i = 0; i < parts.length; i++) {
            if (consumed[i]) continue;
            const part = parts[i];
            if (part.toUpperCase() === 'KG') {
                consumed[i] = true;
                let next = i + 1;
                while(next < parts.length && !consumed[next] && isNumeric(parts[next])) {
                    const pr = parseFloat(parts[next].replace(',', '.'));
                    individualPrices.push(pr); totalPrice += pr; totalQty++; consumed[next] = true; next++;
                }
                i = next - 1; continue;
            }
            if (part.toUpperCase() === 'TX' && i + 1 < parts.length && !consumed[i+1]) {
                let feePart = parts[i + 1];
                if (feePart.toLowerCase().startsWith('d')) { addFeeToTotal = false; feePart = feePart.substring(1); }
                if (isNumeric(feePart)) { customFee = parseFloat(feePart.replace(',', '.')); consumed[i] = true; consumed[i+1] = true; i++; }
                continue;
            }
            let qty = 1; let itemPart = part;
            const qm = part.match(/^(\d+)([a-zA-Z\s]+)/);
            if (qm) { qty = parseInt(qm[1], 10); itemPart = qm[2]; }
            const prDef = predefinedPrices[itemPart.toUpperCase()];
            if (prDef) {
                consumed[i] = true;
                let priceToUse = prDef;
                if (i + 1 < parts.length && !consumed[i + 1] && isNumeric(parts[i + 1])) { priceToUse = parseFloat(parts[i + 1].replace(',', '.')); consumed[i + 1] = true; i++; }
                for (let j = 0; j < qty; j++) { predefinedItems.push({ name: itemPart.toUpperCase(), price: priceToUse }); totalPrice += priceToUse; }
                totalQty += qty; continue;
            }
        }

        const potName = parts.filter((_, idx) => !consumed[idx]).join(' ');
        if(!customerName) customerName = potName;

        const finalFee = isTaxExempt ? 0 : customFee !== null ? customFee : deliveryFeeApplicable ? deliveryFee : 0;
        const total = addFeeToTotal ? (totalPrice + finalFee) : totalPrice;

        const nameParts = [];
        if (predefinedItems.length > 0) nameParts.push(predefinedItems.map(p => p.name).join(' '));
        if (individualPrices.length > 0) nameParts.push('KG');
        if (procBomboniere.length > 0) nameParts.push(procBomboniere.map(it => `${it.quantity > 1 ? it.quantity : ''}${it.name}`).join(' '));
        const consolidatedName = nameParts.join(' + ') || 'Lançamento';

        let finalTimestamp: Timestamp;
        if (currentItem) {
            let itemDate: Date;
            if (currentItem.timestamp?.toDate) {
                itemDate = currentItem.timestamp.toDate();
            } else {
                itemDate = new Date(currentItem.timestamp);
            }
            
            const updatedDate = finalDate;
            updatedDate.setSeconds(itemDate.getSeconds());
            updatedDate.setMilliseconds(itemDate.getMilliseconds());
            finalTimestamp = Timestamp.fromDate(updatedDate);
        } else {
            finalTimestamp = Timestamp.fromDate(finalDate);
        }

        const finalItem: Omit<Item, 'id'> = {
            userId: user.uid,
            name: consolidatedName,
            quantity: totalQty,
            price: totalPrice,
            group,
            timestamp: finalTimestamp,
            deliveryFee: finalFee,
            total,
            originalCommand: rawInput,
            reportado: true,
            reportDate: newReportDateStr,
            ...(customerName && { customerName }),
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
            ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
            ...(procBomboniere.length > 0 ? { bomboniereItems: procBomboniere } : {}),
        };

        if (bomboniereItems) {
            for (const soldItem of procBomboniere) {
                const itemDef = bomboniereItems.find((i) => i.id === soldItem.id);
                if (itemDef) {
                    batch.update(doc(firestore, 'bomboniere_items', itemDef.id), { estoque: itemDef.estoque - soldItem.quantity });
                }
            }
        }

        if (currentItem) {
            batch.set(doc(firestore, 'order_items', currentItem.id), finalItem);
        } else {
            batch.set(doc(collection(firestore, 'order_items')), finalItem);
        }

        await batch.commit();
        
        await recalculateReport(newReportDateStr);
        if (oldReportDate && oldReportDate !== newReportDateStr) {
            await recalculateReport(oldReportDate);
        }

        toast({ title: 'Sucesso', description: 'O lançamento foi atualizado.' });
        setArchivedItemToEdit(null);
        setActiveReportDateForAdd(null);
        setEditArchivedInput('');
    } catch (error: any) {
        console.error("Error upserting archived item:", error);
        toast({ variant: 'destructive', title: 'Erro', description: 'Ocorreu um erro ao guardar.' });
    } finally {
        setIsProcessingEdit(false);
    }
  };

  const handleBomboniereAddForArchived = (itemsToAdd: SelectedBomboniereItem[]) => {
    if (!bomboniereItems) return;
    const itemsString = itemsToAdd
      .map((item) => {
        const qtyPart = item.quantity;
        const namePart = bomboniereItems.find((bi) => bi.id === item.id)?.name || item.name;
        return `${qtyPart} ${namePart} ${String(item.price).replace('.', ',')}`;
      })
      .join(' ');

    setIsBomboniereModalOpen(false);
    setEditArchivedInput((prev) => `${prev} ${itemsString}`.trim());
  };

  const confirmDeleteArchivedItem = async (itemToDelete: Item) => {
    if (!firestore) return;
    setIsProcessingEdit(true);

    try {
        const batch = writeBatch(firestore);
        const reportDate = itemToDelete.reportDate;

        if (itemToDelete.bomboniereItems && itemToDelete.bomboniereItems.length > 0 && bomboniereItems) {
            for (const soldItem of itemToDelete.bomboniereItems) {
                const itemDef = bomboniereItems.find((i) => i.id === soldItem.id);
                if (itemDef) {
                    batch.update(doc(firestore, 'bomboniere_items', itemDef.id), { estoque: itemDef.estoque + soldItem.quantity });
                }
            }
        }

        batch.delete(doc(firestore, 'order_items', itemToDelete.id));
        await batch.commit();
        
        if (reportDate) await recalculateReport(reportDate);

        toast({ title: 'Item removido', variant: 'destructive' });
    } catch (error: any) {
        console.error("Error deleting archived item:", error);
        toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível remover o item.' });
    } finally {
        setIsProcessingEdit(false);
        setArchivedItemToDelete(null);
    }
  };

  const handleDeleteReportRequest = (id: string) => {
    const report = allReports?.find(r => r.id === id);
    if (report) setReportToDelete(report);
  };

  const handleEditDateRequest = (report: DailyReport) => {
    setReportToEditDate(report);
    if (report.reportDate) {
        setNewReportDate(new Date(report.reportDate + 'T12:00:00'));
    }
  };

  const confirmDeleteReport = async () => {
    if (!firestore || !reportToDelete?.id || !reportToDelete.reportDate) return;
    
    try {
        const batch = writeBatch(firestore);
        const reportDateStr = reportToDelete.reportDate;

        const orderItemsQuery = query(collection(firestore, 'order_items'), where('reportDate', '==', reportDateStr));
        const orderItemsSnapshot = await getDocs(orderItemsQuery);

        orderItemsSnapshot.forEach(orderDoc => {
            const item = orderDoc.data();
            const liveItemRef = doc(collection(firestore, 'live_items'), orderDoc.id);
            batch.set(liveItemRef, { ...item, reportado: false });
            batch.delete(orderDoc.ref);
        });
        
        batch.delete(doc(firestore, "daily_reports", reportToDelete.id));
        await batch.commit();
        toast({ title: "Sucesso", description: "Relatório excluído e itens movidos de volta." });
    } catch (error: any) {
        console.error("Error deleting report:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o relatório." });
    } finally {
        setReportToDelete(null);
    }
  };
  
  const confirmEditDate = async () => {
    if (!firestore || !reportToEditDate || !newReportDate || !user?.uid) return;
    setIsUpdatingDate(true);
    const oldDateStr = reportToEditDate.reportDate;
    const newDateStr = format(newReportDate, 'yyyy-MM-dd');

    if (oldDateStr === newDateStr) {
        setIsUpdatingDate(false); 
        setReportToEditDate(null); 
        return;
    }

    try {
        const batch = writeBatch(firestore);
        
        batch.update(doc(firestore, "daily_reports", reportToEditDate.id!), { 
            reportDate: newDateStr,
            updatedAt: new Date().toISOString()
        });

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
            title: "Sincronização Concluída", 
            description: `Relatório e ${orderItemsSnapshot.size} pedidos movidos para ${safeFormat(newReportDate, 'dd/MM/yyyy', { locale: ptBR })}.` 
        });
    } catch (error: any) {
        console.error("Error updating report date:", error);
        toast({ 
            variant: "destructive", 
            title: "Erro na Sincronização", 
            description: "Não foi possível mover os dados para a nova data." 
        });
    } finally {
        setIsUpdatingDate(false); 
        setReportToEditDate(null); 
        setNewReportDate(undefined);
    }
  };
  
  if (isLoading && allReports.length === 0) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <BomboniereModal
        isOpen={isBomboniereModalOpen}
        onClose={() => setIsBomboniereModalOpen(false)}
        onAddItems={handleBomboniereAddForArchived}
        bomboniereItems={bomboniereItems || []}
      />

      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Relatório?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação moverá os itens de volta para a tela principal.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReport}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archivedItemToDelete} onOpenChange={(open) => !open && setArchivedItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento do Histórico?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é permanente e irá recalcular os totais deste relatório diário.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => archivedItemToDelete && confirmDeleteArchivedItem(archivedItemToDelete)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!archivedItemToEdit || !!activeReportDateForAdd} onOpenChange={(open) => {
          if(!open) { setArchivedItemToEdit(null); setActiveReportDateForAdd(null); setEditArchivedInput(''); }
      }}>
        <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
                <DialogTitle>{archivedItemToEdit ? 'Editar Lançamento Histórico' : 'Novo Lançamento Histórico'}</DialogTitle>
                <DialogDescription>
                    {archivedItemToEdit ? 'Corrija os dados deste pedido.' : 'Insira os dados para adicionar um novo item a este relatório.'}
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-6">
                <div className="space-y-2">
                    <Label>Comando do Pedido</Label>
                    <div className="flex gap-2">
                        <Input 
                            value={editArchivedInput} 
                            onChange={(e) => setEditArchivedInput(e.target.value)}
                            placeholder="Ex: M P coca-lata"
                            className="h-12"
                            autoFocus
                        />
                        <FavoritesMenu 
                            savedFavorites={savedFavorites} 
                            onSelect={(fav) => {
                                setEditArchivedInput(fav.command);
                            }} 
                            onDelete={(id) => setSavedFavorites(prev => prev.filter(f => f.id !== id))} 
                        />
                        <Button 
                            variant="outline" 
                            className="h-12 px-4" 
                            onClick={() => setIsBomboniereModalOpen(true)}
                        >
                            <Plus className="h-5 w-5" />
                            <span className="hidden sm:inline ml-2">Outros</span>
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Data</Label>
                        <div className="border rounded-md p-2 bg-background flex justify-center">
                            <Calendar
                                mode="single"
                                selected={editArchivedDate}
                                onSelect={setEditArchivedDate}
                                locale={ptBR}
                                initialFocus
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2"><Clock className="h-4 w-4" /> Hora</Label>
                        <Input 
                            type="time" 
                            value={editArchivedTime} 
                            onChange={(e) => setEditArchivedTime(e.target.value)}
                            className="h-10"
                        />
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => { setArchivedItemToEdit(null); setActiveReportDateForAdd(null); }}>Cancelar</Button>
                <Button 
                    onClick={() => handleUpsertArchivedItem(editArchivedInput, archivedItemToEdit, activeReportDateForAdd || undefined)}
                    disabled={isProcessingEdit || !editArchivedInput.trim() || !editArchivedDate}
                >
                    {isProcessingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                    {archivedItemToEdit ? 'Salvar Alteração' : 'Adicionar ao Relatório'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!reportToEditDate} onOpenChange={(open) => { if (!open) setReportToEditDate(null)}}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
                <DialogTitle>Alterar Data do Relatório</DialogTitle>
                <DialogDescription>
                    Selecione a nova data. Todos os pedidos deste dia serão movidos automaticamente para o histórico do cliente.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 flex flex-col items-center bg-muted/30 rounded-md">
                <Calendar
                    mode="single"
                    selected={newReportDate}
                    onSelect={setNewReportDate}
                    locale={ptBR}
                    className="border rounded-md bg-background"
                />
                {newReportDate && (
                    <p className="mt-4 text-sm font-medium text-primary">
                        Nova data: {safeFormat(newReportDate, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                )}
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
                       <DailyReportsSection 
                            reports={allReports || []} 
                            bomboniereItems={bomboniereItems || []} 
                            onDeleteRequest={handleDeleteReportRequest} 
                            onEditDateRequest={handleEditDateRequest} 
                            onEditItem={(item) => {
                                setArchivedItemToEdit(item);
                            }}
                            onDeleteItem={setArchivedItemToDelete}
                            onAddItem={(date) => {
                                setActiveReportDateForAdd(date);
                                setEditArchivedInput('');
                                setEditArchivedDate(new Date(date + 'T12:00:00'));
                                setEditArchivedTime('12:00');
                            }}
                       />
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
                        <CustomerReportsSection 
                            bomboniereItems={bomboniereItems || []} 
                            onEditItem={(item) => {
                                setArchivedItemToEdit(item);
                            }}
                            onDeleteItem={setArchivedItemToDelete}
                        />
                    </AccordionContent>
                </Card>
            </AccordionItem>

        </Accordion>
      </main>
    </>
  );
}

export default function ReportsPage() {
    const { user, isUserLoading } = useUser();

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
