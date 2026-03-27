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
    startOfMonth, 
    endOfMonth, 
    startOfWeek,
    endOfWeek,
    isWithinInterval,
    setYear,
    setMonth,
    isValid,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
    Loader2, 
    Trash2, 
    CalendarDays, 
    ListOrdered, 
    User, 
    Eye, 
    Calendar as CalendarIcon, 
    Pencil, 
    Plus,
    TrendingUp,
    CalendarCheck,
    BarChart3,
    History,
    Sparkles,
    Zap,
    Save,
    Clock
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
import type { 
    DailyReport, 
    ItemCount, 
    BomboniereItem, 
    Item, 
    Group,
    PredefinedItem,
    SelectedBomboniereItem
} from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ItemList from '@/components/item-list';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import usePersistentState from '@/hooks/use-persistent-state';
import BomboniereModal from '@/components/bomboniere-modal';
import { DatePicker } from '@/components/ui/date-picker';
import { PREDEFINED_PRICES } from '@/lib/constants';
import { generateManagementReport, type ManagementReportOutput } from '@/ai/flows/generate-management-report';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp-icon';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

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

function getLevenshteinDistance(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[a.length][b.length];
}

const normalizeKey = (name: string) => {
    if (!name) return "";
    return name
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
};

const PREDEFINED_KEYS = Object.keys(PREDEFINED_PRICES).concat(['KG']);

const mergeCounts = (target: Record<string, number>, source: Record<string, number>) => {
    if (!source) return target;
    Object.entries(source).forEach(([name, qty]) => {
        target[name] = (target[name] || 0) + (qty || 0);
    });
    return target;
};

const SummaryDisplay = ({ data, title = "Resumo do Dia - FATURAMENTO" }: { data: any, title?: string }) => {
    const contagemTotal = data.contagemTotal || {};
    const contagemRua = data.contagemRua || {};
    
    const contagemSalao: Record<string, number> = {};
    Object.keys(contagemTotal).forEach(key => {
        const total = contagemTotal[key] || 0;
        const rua = contagemRua[key] || 0;
        const salao = total - rua;
        if (salao > 0) contagemSalao[key] = salao;
    });

    const renderItemCountSection = (counts: Record<string, number>, isBomboniere: boolean) => {
        const items = Object.entries(counts).filter(([key]) => {
            const isPredefined = PREDEFINED_KEYS.includes(key.toUpperCase());
            return isBomboniere ? !isPredefined : isPredefined;
        });

        if (items.length === 0) return <p className="text-[0.65rem] text-muted-foreground/50 italic">Nenhum item</p>;

        return (
            <div className="space-y-0.5">
                {items.map(([name, qty]) => (
                    <div key={name} className="flex gap-2 items-center text-[0.7rem]">
                        <span className="font-bold w-3 text-right">{qty}</span>
                        <span className="uppercase text-muted-foreground font-medium">{name}</span>
                    </div>
                ))}
            </div>
        );
    };

    const totalSalaoItems = Object.entries(contagemSalao).reduce((acc, [_, v]) => acc + v, 0);
    const totalRuaItems = Object.entries(contagemRua).reduce((acc, [_, v]) => acc + v, 0);

    return (
        <div className="space-y-6 pt-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/20 p-4 rounded-t-lg border-b border-border/50">
                <h2 className="text-lg font-bold tracking-tight uppercase text-muted-foreground">{title}</h2>
                <div className="text-right">
                    <p className="text-3xl font-black text-primary leading-none">{formatCurrency(data.totalGeral)}</p>
                    <p className="text-[0.6rem] text-muted-foreground uppercase font-bold mt-1 tracking-tighter">
                        Faturamento à Vista: <span className="text-foreground">{formatCurrency(data.totalAVista)}</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_2fr] gap-10 px-4 pb-4">
                <div className="space-y-4">
                    <h3 className="font-bold uppercase text-[0.65rem] tracking-widest text-muted-foreground/70 border-b pb-1">Resumo Financeiro</h3>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between font-medium"><span>Vendas Salão:</span> <span>{formatCurrency(data.totalVendasSalao)}</span></div>
                        <div className="flex justify-between font-medium text-blue-400"><span>Vendas Rua:</span> <span>{formatCurrency(data.totalVendasRua)}</span></div>
                        <div className="flex justify-between font-medium text-pink-500/80"><span>Fiado Salão:</span> <span>{formatCurrency(data.totalFiadoSalao)}</span></div>
                        <div className="flex justify-between font-medium text-orange-400/80"><span>Fiado Rua:</span> <span>{formatCurrency(data.totalFiadoRua)}</span></div>
                        
                        <Separator className="my-3 opacity-30"/>
                        
                        <div className="flex justify-between"><span>Total Geral Bomboniere:</span> <span className="font-bold">{formatCurrency((data.totalBomboniereSalao || 0) + (data.totalBomboniereRua || 0))}</span></div>
                        
                        <div className="flex justify-between mt-4 text-muted-foreground">
                            <span>Total Entregas:</span> 
                            <span><span className="font-bold text-foreground">{data.totalEntregas}</span> ({formatCurrency(data.totalTaxas)})</span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-2 mt-2">
                            <span>Total Geral (Itens):</span> 
                            <span className="text-primary">{data.totalItens}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold uppercase text-[0.65rem] tracking-widest text-muted-foreground/70 border-b pb-1">Contagem de Itens</h3>
                    
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <h4 className="text-[0.65rem] font-black uppercase text-purple-400 tracking-tighter">Salão</h4>
                                {renderItemCountSection(contagemSalao, false)}
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-[0.6rem] font-bold uppercase text-purple-400/50 tracking-tighter border-t border-purple-400/10 pt-1">Bomboniere</h4>
                                {renderItemCountSection(contagemSalao, true)}
                            </div>
                            <div className="pt-2 border-t border-dashed opacity-40">
                                <p className="text-[0.6rem] text-muted-foreground">({totalSalaoItems} itens)</p>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div className="space-y-2">
                                <h4 className="text-[0.65rem] font-black uppercase text-blue-400 tracking-tighter">Rua</h4>
                                {renderItemCountSection(contagemRua, false)}
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-[0.6rem] font-bold uppercase text-blue-400/50 tracking-tighter border-t border-blue-400/10 pt-1">Bomboniere</h4>
                                {renderItemCountSection(contagemRua, true)}
                            </div>
                            <div className="pt-2 border-t border-dashed opacity-40">
                                <p className="text-[0.6rem] text-muted-foreground">({totalRuaItems} itens)</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CustomerReportsSection = ({ 
    globalDate,
    onEditItem,
    onDeleteItem,
    recalculateFn
}: { 
    globalDate: Date,
    onEditItem: (item: Item) => void,
    onDeleteItem: (item: Item) => void,
    recalculateFn: (d: string) => Promise<void>
}) => {
    const firestore = useFirestore();
    const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);
    
    const orderItemsQuery = useMemo(() => {
        if (!firestore) return null;
        const start = format(startOfMonth(globalDate), 'yyyy-MM-dd');
        const end = format(endOfMonth(globalDate), 'yyyy-MM-dd');
        return query(
            collection(firestore, 'order_items'),
            where('reportDate', '>=', start),
            where('reportDate', '<=', end)
        );
    }, [firestore, globalDate]);

    const { data: items, isLoading } = useCollection<Item>(orderItemsQuery);

    const customerData = useMemo(() => {
        if (!items) return [];
        const rawStats: Record<string, { name: string, total: number, count: number, orders: Item[] }> = {};
        
        items.forEach(item => {
            if (item.customerName) {
                const rawName = item.customerName.trim();
                const key = normalizeKey(rawName);
                if (!rawStats[key]) {
                    rawStats[key] = { name: rawName, total: 0, count: 0, orders: [] };
                }
                rawStats[key].total += item.total;
                rawStats[key].count += 1;
                rawStats[key].orders.push(item);
            }
        });

        const finalStats: Record<string, { name: string, total: number, count: number, orders: Item[] }> = {};
        const keys = Object.keys(rawStats).sort((a, b) => rawStats[b].count - rawStats[a].count);
        const processedKeys = new Set<string>();

        for (let i = 0; i < keys.length; i++) {
            const currentKey = keys[i];
            if (processedKeys.has(currentKey)) continue;

            const group = { ...rawStats[currentKey] };
            processedKeys.add(currentKey);

            for (let j = i + 1; j < keys.length; j++) {
                const nextKey = keys[j];
                if (processedKeys.has(nextKey)) continue;

                const distance = getLevenshteinDistance(currentKey, nextKey);
                const isVerySimilar = distance <= (currentKey.length > 6 ? 2 : 1);
                const isSubstring = currentKey.includes(nextKey) || nextKey.includes(currentKey);

                if (isVerySimilar || isSubstring) {
                    group.total += rawStats[nextKey].total;
                    group.count += rawStats[nextKey].count;
                    group.orders = [...group.orders, ...rawStats[nextKey].orders];
                    processedKeys.add(nextKey);
                }
            }
            finalStats[currentKey] = group;
        }
        
        return Object.values(finalStats)
            .map(data => ({
                ...data,
                orders: data.orders.sort((a, b) => {
                    const getT = (ts: any) => (ts?.toMillis ? ts.toMillis() : new Date(ts).getTime() || 0);
                    return getT(b.timestamp) - getT(a.timestamp);
                })
            }))
            .sort((a, b) => b.total - a.total);
    }, [items]);

    const selectedCustomer = useMemo(() => {
        if (!selectedCustomerName) return null;
        const key = normalizeKey(selectedCustomerName);
        return customerData.find(c => normalizeKey(c.name) === key) || null;
    }, [customerData, selectedCustomerName]);

    const handleWhatsAppShare = () => {
        if (!selectedCustomer) return;
        
        const dateStr = format(globalDate, 'MMMM yyyy', { locale: ptBR });
        let message = `*Restaurante da Mirinha*\n`;
        message += `*Histórico de Consumo - ${dateStr}*\n`;
        message += `*Cliente:* ${selectedCustomer.name}\n\n`;
        
        selectedCustomer.orders.forEach(order => {
            const d = order.timestamp?.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
            const day = format(d, 'dd/MM');
            message += `• ${day}: ${order.name} - _${formatCurrency(order.total)}_\n`;
        });
        
        message += `\n*TOTAL: ${formatCurrency(selectedCustomer.total)}*`;
        
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    };

    return (
        <div className="space-y-6">
            <Dialog open={!!selectedCustomerName} onOpenChange={(open) => !open && setSelectedCustomerName(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <User className="h-5 w-5 text-primary" /> Histórico de {selectedCustomer?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="bg-primary/10 p-4 rounded-lg flex justify-between items-center my-2">
                        <span className="text-xs font-black uppercase text-primary tracking-widest">Total Acumulado</span>
                        <span className="text-2xl font-black text-primary">{formatCurrency(selectedCustomer?.total)}</span>
                    </div>
                    <ScrollArea className="max-h-[50vh] pr-4">
                        <div className="space-y-3">
                            {selectedCustomer?.orders.map((order, idx) => (
                                <div key={order.id || idx} className="flex justify-between items-center p-3 rounded-lg border bg-muted/30">
                                    <div>
                                        <p className="text-[0.65rem] text-muted-foreground">{safeFormat(order.timestamp, 'dd/MM/yy HH:mm')}</p>
                                        <p className="text-sm font-semibold">{order.name}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm font-mono font-bold text-foreground">{formatCurrency(order.total)}</p>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={() => onEditItem(order)}><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDeleteItem(order)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="flex flex-col sm:flex-row justify-end items-center gap-4 border-t pt-4">
                        <Button 
                            variant="outline" 
                            className="w-full sm:w-auto border-green-500 text-green-500 hover:bg-green-500/10 font-bold" 
                            onClick={handleWhatsAppShare}
                        >
                            <WhatsAppIcon className="mr-2 h-4 w-4" />
                            Partilhar WhatsApp
                        </Button>
                        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedCustomerName(null)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {isLoading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : customerData.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b"><tr><th className="text-left p-4 font-medium">Cliente (Unificação IA)</th><th className="text-center p-4 font-medium">Pedidos</th><th className="text-right p-4 font-medium">Total</th><th className="w-10"></th></tr></thead>
                        <tbody className="divide-y">
                            {customerData.map((cust) => (
                                <tr key={cust.name} className="hover:bg-muted/30 cursor-pointer group" onClick={() => setSelectedCustomerName(cust.name)}>
                                    <td className="p-4 flex items-center gap-2"><div className="bg-primary/10 text-primary p-1.5 rounded-full"><User className="h-4 w-4" /></div><span className="font-semibold">{cust.name}</span></td>
                                    <td className="p-4 text-center text-muted-foreground">{cust.count}</td>
                                    <td className="p-4 text-right font-mono font-bold text-primary">{formatCurrency(cust.total)}</td>
                                    <td className="pr-4 text-right"><Eye className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <p className="text-center py-20 text-muted-foreground">Sem consumo este mês.</p>}
        </div>
    );
};

const ReportDetail = ({ report, onEditItem, onDeleteItem, onAddItem }: { report: DailyReport | null, onEditItem: (item: Item) => void, onDeleteItem: (item: Item) => void, onAddItem: (d: string) => void }) => {
    const firestore = useFirestore();
    const q = useMemo(() => firestore && report?.reportDate ? query(collection(firestore, 'order_items'), where('reportDate', '==', report.reportDate)) : null, [firestore, report?.reportDate]);
    const { data: rawItems, isLoading } = useCollection<Item>(q);
    const sortedItems = useMemo(() => (rawItems || []).sort((a, b) => {
        const getT = (ts: any) => (ts?.toMillis ? ts.toMillis() : new Date(ts).getTime() || 0);
        return getT(b.timestamp) - getT(a.timestamp);
    }), [rawItems]);

    if (!report) return null;

    return (
        <div className="space-y-6">
            <SummaryDisplay data={report} />
            <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-4"><h4 className="font-bold flex items-center gap-2 text-xs uppercase text-muted-foreground tracking-widest"><ListOrdered className="h-4 w-4"/>Pedidos do Dia</h4><Button variant="outline" size="sm" onClick={() => onAddItem(report.reportDate)}><Plus className="h-4 w-4 mr-1"/>Novo</Button></div>
                {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto" /> : <div className="rounded-md border"><ItemList items={sortedItems} isLoading={false} onEdit={onEditItem} onDelete={(id) => { const it = sortedItems.find(i => id === i.id); if(it) onDeleteItem(it); }} /></div>}
            </div>
        </div>
    );
};

export default function ReportsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const [globalDate, setGlobalDate] = useState<Date>(new Date());
  
  const [reportToDelete, setReportToDelete] = useState<DailyReport | null>(null);
  const [archivedItemToDelete, setArchivedItemToDelete] = useState<Item | null>(null);
  const [archivedItemToEdit, setArchivedItemToEdit] = useState<Item | null>(null);
  const [editArchivedInput, setEditArchivedInput] = useState('');
  const [editArchivedDate, setEditArchivedDate] = useState<Date | undefined>();
  const [editArchivedTime, setEditArchivedTime] = useState('12:00');
  const [isProcessingEdit, setIsProcessingEdit] = useState(false);
  const [activeReportDateForAdd, setActiveReportDateForAdd] = useState<string | null>(null);
  
  const [isBomboniereModalOpen, setIsBomboniereModalOpen] = useState(false);
  const [deliveryFee] = usePersistentState('deliveryFee', 6.00);
  const [predefinedPrices] = usePersistentState('predefinedPrices', PREDEFINED_PRICES);

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiReport, setAiReport] = useState<ManagementReportOutput | null>(null);
  const [aiScope] = useState<'month' | 'year'>('month');
  
  const reportsQ = useMemo(() => firestore ? query(collection(firestore, 'daily_reports')) : null, [firestore]);
  const { data: allReportsRaw, isLoading: isLoadingReports } = useCollection<DailyReport>(reportsQ);
  const allReports = useMemo(() => (allReportsRaw || []).filter(r => r.reportDate).sort((a, b) => b.reportDate.localeCompare(a.reportDate)), [allReportsRaw]);
  
  const monthlyReports = useMemo(() => allReports.filter(r => { 
      const d = parseISO(r.reportDate); 
      return d.getFullYear() === globalDate.getFullYear() && d.getMonth() === globalDate.getMonth(); 
  }), [allReports, globalDate]);

  const monthTotal = useMemo(() => monthlyReports.reduce((acc, r) => acc + r.totalGeral, 0), [monthlyReports]);

  const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);
  const { data: bomboniereItems } = useCollection<BomboniereItem>(bomboniereItemsQuery);
  const bomboniereItemsByName = useMemo(() => {
    if (!bomboniereItems) return {};
    return bomboniereItems.reduce((acc, item) => { acc[item.name.toLowerCase()] = item; return acc; }, {} as Record<string, BomboniereItem>);
  }, [bomboniereItems]);

  const dashboardStats = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const weekStart = startOfWeek(new Date(), { locale: ptBR });
    const weekEnd = endOfWeek(new Date(), { locale: ptBR });
    return allReports.reduce((acc, r) => {
        const d = parseISO(r.reportDate);
        if (r.reportDate === todayStr) acc.today += r.totalGeral;
        if (isWithinInterval(d, { start: weekStart, end: weekEnd })) acc.week += r.totalGeral;
        if (d.getFullYear() === globalDate.getFullYear() && d.getMonth() === globalDate.getMonth()) acc.month += r.totalGeral;
        if (d.getFullYear() === globalDate.getFullYear()) acc.year += r.totalGeral;
        return acc;
    }, { today: 0, week: 0, month: 0, year: 0 });
  }, [allReports, globalDate]);

  useEffect(() => {
    if (archivedItemToEdit) {
        setEditArchivedInput(archivedItemToEdit.originalCommand || '');
        const d = archivedItemToEdit.timestamp?.toDate ? archivedItemToEdit.timestamp.toDate() : new Date(archivedItemToEdit.timestamp);
        if (isValid(d)) { setEditArchivedDate(d); setEditArchivedTime(format(d, 'HH:mm')); }
    }
  }, [archivedItemToEdit]);

  const recalculateReport = async (reportDate: string) => {
    if (!firestore || !user?.uid) return;
    try {
        const snapshot = await getDocs(query(collection(firestore, 'order_items'), where('reportDate', '==', reportDate)));
        const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Item));
        const reportSnapshot = await getDocs(query(collection(firestore, 'daily_reports'), where('reportDate', '==', reportDate)));
        if (items.length === 0) { if (!reportSnapshot.empty) await deleteDoc(reportSnapshot.docs[0].ref); return; }
        const totals = items.reduce((acc, item) => {
            acc.totalGeral += item.total; acc.totalItens += item.quantity; acc.totalTaxas += item.deliveryFee;
            const itemIsRua = item.group.includes('rua'); if (itemIsRua) { if (item.deliveryFee > 0) acc.totalEntregas++; acc.totalItensRua += item.quantity; }
            if (item.group.includes('Fiados')) acc.totalFiado += item.total; else acc.totalAVista += item.total;
            switch (item.group) { case 'Vendas salão': acc.totalVendasSalao += item.total; break; case 'Vendas rua': acc.totalVendasRua += item.total; break; case 'Fiados salão': acc.totalFiadoSalao += item.total; break; case 'Fiados rua': acc.totalFiadoRua += item.total; break; }
            const itemsToCount = [ ...(item.predefinedItems?.map((i) => ({ ...i, count: 1 })) || []), ...(item.bomboniereItems?.map((i) => ({ name: i.name, count: i.quantity })) || []), ...(item.individualPrices?.map(() => ({ name: 'KG', count: 1 })) || []) ];
            itemsToCount.forEach(({ name, count }) => { acc.contagemTotal[name] = (acc.contagemTotal[name] || 0) + count; if (itemIsRua) acc.contagemRua[name] = (acc.contagemRua[name] || 0) + count; });
            const bTotal = item.bomboniereItems?.reduce((sum, bi) => sum + bi.price * bi.quantity, 0) || 0;
            if (itemIsRua) acc.totalBomboniereRua += bTotal; else acc.totalBomboniereSalao += bTotal; return acc;
        }, { totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0, totalVendasRua: 0, totalFiadoSalao: 0, totalFiadoRua: 0, totalTaxas: 0, totalItens: 0, totalEntregas: 0, totalItensRua: 0, totalBomboniereSalao: 0, totalBomboniereRua: 0, contagemTotal: {} as ItemCount, contagemRua: {} as ItemCount });
        if (!reportSnapshot.empty) await setDoc(reportSnapshot.docs[0].ref, { ...totals, totalPedidos: items.length, reportDate, userId: user.uid }, { merge: true });
        else await addDoc(collection(firestore, 'daily_reports'), { ...totals, totalPedidos: items.length, reportDate, userId: user.uid, createdAt: new Date().toISOString() });
    } catch (e) { console.error(e); }
  };

  const handleUpsertArchivedItem = async (rawInput: string, currentItem?: Item | null) => {
    if (!firestore || !user?.uid || !editArchivedDate) return;
    setIsProcessingEdit(true);
    const [h, m] = editArchivedTime.split(':').map(Number);
    const finalDate = new Date(editArchivedDate);
    if (currentItem?.timestamp) { 
        const orig = currentItem.timestamp.toDate ? currentItem.timestamp.toDate() : new Date(currentItem.timestamp); 
        finalDate.setHours(h, m, orig.getSeconds(), orig.getMilliseconds()); 
    } else { 
        finalDate.setHours(h, m, 0, 0); 
    }
    const newDateStr = format(finalDate, 'yyyy-MM-dd');
    try {
        let mainInput = rawInput.trim(); if (!mainInput) { setIsProcessingEdit(false); return; }
        let group: Group = 'Vendas salão'; let deliveryFeeApplicable = false; let isTaxExempt = false; let customerName: string | undefined = undefined;
        const partsWithExemption = mainInput.split(' ').filter((part) => part.trim() !== '');
        if (partsWithExemption.map((p) => p.toUpperCase()).includes('E')) { isTaxExempt = true; mainInput = partsWithExemption.filter((p) => p.toUpperCase() !== 'E').join(' '); }
        const upperCaseProcessedInput = mainInput.toUpperCase();
        if (upperCaseProcessedInput.startsWith('R ')) { group = 'Vendas rua'; deliveryFeeApplicable = true; mainInput = mainInput.substring(2).trim(); }
        else if (upperCaseProcessedInput.startsWith('FR ')) { group = 'Fiados rua'; deliveryFeeApplicable = true; mainInput = mainInput.substring(3).trim(); }
        else if (upperCaseProcessedInput.startsWith('F ')) { group = 'Fiados salão'; mainInput = mainInput.substring(2).trim(); }
        let parts = mainInput.split(' ').filter((part) => part.trim() !== '');
        let consumedParts = new Array(parts.length).fill(false);
        let totalQuantity = 0; let totalPrice = 0; let individualPrices: number[] = []; let predefinedItems: PredefinedItem[] = []; let processedBomboniereItems: SelectedBomboniereItem[] = []; let customDeliveryFee: number | null = null; let addFeeToTotal = true;
        for (let i = 0; i < parts.length; i++) {
            if (consumedParts[i]) continue; let bestMatch = null; let bestMatchEndIndex = -1;
            for (let j = parts.length; j > i; j--) { const potentialName = parts.slice(i, j).join(' ').toLowerCase(); if (bomboniereItemsByName[potentialName]) { bestMatch = bomboniereItemsByName[potentialName]; bestMatchEndIndex = j; break; } }
            if (bestMatch) {
                let bomboniereQty = 1; if (i > 0 && !consumedParts[i - 1] && !isNaN(parseFloat(parts[i-1]))) { bomboniereQty = parseInt(parts[i - 1], 10); consumedParts[i - 1] = true; }
                let priceToUse = bestMatch.price; if (bestMatchEndIndex < parts.length && !consumedParts[bestMatchEndIndex] && !isNaN(parseFloat(parts[bestMatchEndIndex]))) { priceToUse = parseFloat(bestMatchEndIndex < parts.length ? parts[bestMatchEndIndex].replace(',', '.') : '0'); consumedParts[bestMatchEndIndex] = true; }
                processedBomboniereItems.push({ id: bestMatch.id, name: bestMatch.name, quantity: bomboniereQty, price: priceToUse }); totalPrice += priceToUse * bomboniereQty; totalQuantity += bomboniereQty;
                for (let k = i; k < bestMatchEndIndex; k++) consumedParts[k] = true; i = bestMatchEndIndex - 1;
            }
        }
        for (let i = 0; i < parts.length; i++) {
            if (consumedParts[i]) continue; const part = parts[i];
            if (part.toUpperCase() === 'KG') {
                consumedParts[i] = true; let nextIndex = i + 1;
                while(nextIndex < parts.length && !consumedParts[nextIndex] && !isNaN(parseFloat(parts[nextIndex]))) { const price = parseFloat(parts[nextIndex].replace(',', '.')); individualPrices.push(price); totalPrice += price; totalQuantity++; consumedParts[nextIndex] = true; nextIndex++; }
                i = nextIndex - 1; continue;
            }
            if (part.toUpperCase() === 'TX') {
                if (i + 1 < parts.length && !consumedParts[i+1]) { let feePart = parts[i + 1]; if (feePart.toLowerCase().startsWith('d')) { addFeeToTotal = false; feePart = feePart.substring(1); } if (!isNaN(parseFloat(feePart))) { customDeliveryFee = parseFloat(feePart.replace(',', '.')); consumedParts[i] = true; consumedParts[i+1] = true; i++; } }
                continue;
            }
            let qty = 1; let itemNamePart = part; const qtyMatch = part.match(/^(\d+)([a-zA-Z\s]+)/);
            if (qtyMatch) { qty = parseInt(qtyMatch[1], 10); itemNamePart = qtyMatch[2]; }
            const isPredefined = predefinedPrices[itemNamePart.toUpperCase()];
            if (isPredefined) {
                consumedParts[i] = true; let priceToUse = isPredefined; if (i + 1 < parts.length && !consumedParts[i + 1] && !isNaN(parseFloat(parts[i+1]))) { priceToUse = parseFloat(parts[i + 1].replace(',', '.')); consumedParts[i + 1] = true; i++; }
                for (let j = 0; j < qty; j++) { predefinedItems.push({ name: itemNamePart.toUpperCase(), price: priceToUse }); totalPrice += priceToUse; }
                totalQuantity += qty; continue;
            }
        }
        const potentialCustomerNameParts = parts.filter((_, index) => !consumedParts[index]);
        if (!customerName && potentialCustomerNameParts.length > 0) customerName = potentialCustomerNameParts.join(' ');
        const finalDeliveryFee = isTaxExempt ? 0 : customDeliveryFee !== null ? customDeliveryFee : deliveryFeeApplicable ? deliveryFee : 0;
        const total = addFeeToTotal ? (totalPrice + finalDeliveryFee) : totalPrice;
        let consolidatedName: string; const nameParts = []; if (predefinedItems.length > 0) nameParts.push(predefinedItems.map((p) => p.name).join(' ')); if (individualPrices.length > 0) nameParts.push('KG'); if (processedBomboniereItems.length > 0) nameParts.push(processedBomboniereItems.map((item) => `${item.quantity > 1 ? item.quantity : ''}${item.name}`).join(' '));
        consolidatedName = nameParts.join(' + ') || 'Lançamento';
        const finalItem: Omit<Item, 'id'> = { userId: user.uid, name: consolidatedName, quantity: totalQuantity || 1, price: totalPrice, group, timestamp: Timestamp.fromDate(finalDate), deliveryFee: finalDeliveryFee, total, originalCommand: rawInput, reportado: true, reportDate: newDateStr, ...(customerName && { customerName }), ...(individualPrices.length > 0 ? { individualPrices } : {}), ...(predefinedItems.length > 0 ? { predefinedItems } : {}), ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}), };
        const batch = writeBatch(firestore);
        if (currentItem) batch.set(doc(firestore, 'order_items', currentItem.id), finalItem);
        else batch.set(doc(collection(firestore, 'order_items')), finalItem);
        await batch.commit(); await recalculateReport(newDateStr); if (currentItem?.reportDate && currentItem.reportDate !== newDateStr) await recalculateReport(currentItem.reportDate);
        toast({ title: 'Atualizado com sucesso' }); setArchivedItemToEdit(null); setActiveReportDateForAdd(null);
    } catch (e) { console.error(e); toast({ variant: 'destructive', title: 'Erro ao salvar' }); } finally { setIsProcessingEdit(false); }
  };

  if (isUserLoading || isLoadingReports) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  return (
    <>
      <BomboniereModal isOpen={isBomboniereModalOpen} onClose={() => setIsBomboniereModalOpen(false)} onAddItems={(items) => setEditArchivedInput(prev => `${prev} ${items.map(i => `${i.quantity} ${i.name}`).join(' ')}`)} bomboniereItems={bomboniereItems || []} />

      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Excluir Relatório?</AlertDialogTitle><AlertDialogDescription>Os itens voltarão para o dia de hoje na tela inicial.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => {
                if(!firestore || !reportToDelete) return; const batch = writeBatch(firestore); const snapshot = await getDocs(query(collection(firestore, 'order_items'), where('reportDate', '==', reportToDelete.reportDate)));
                snapshot.forEach(d => { batch.set(doc(collection(firestore, 'live_items'), d.id), { ...d.data(), reportado: false }); batch.delete(d.ref); });
                batch.delete(doc(firestore, "daily_reports", reportToDelete.id!)); await batch.commit(); setReportToDelete(null);
            }}>Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archivedItemToDelete} onOpenChange={(open) => !open && setArchivedItemToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Excluir do Histórico?</AlertDialogTitle></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => {
                if(!archivedItemToDelete || !firestore) return; await deleteDoc(doc(firestore, 'order_items', archivedItemToDelete.id));
                if(archivedItemToDelete.reportDate) await recalculateReport(archivedItemToDelete.reportDate); setArchivedItemToDelete(null);
            }} className="bg-destructive">Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!archivedItemToEdit || !!activeReportDateForAdd} onOpenChange={(open) => { if(!open) { setArchivedItemToEdit(null); setActiveReportDateForAdd(null); } }}>
        <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{archivedItemToEdit ? 'Editar' : 'Novo'} Lançamento</DialogTitle></DialogHeader>
            <div className="py-4 space-y-6">
                <div className="space-y-3"><Label className="flex items-center gap-2 text-primary"><ListOrdered className="h-4 w-4"/> Comando do Pedido</Label><div className="flex gap-2"><Input value={editArchivedInput} onChange={(e) => setEditArchivedInput(e.target.value)} className="h-12 text-lg font-medium" placeholder="Ex: M P coca-lata" /><Button variant="outline" onClick={() => setIsBomboniereModalOpen(true)} className="h-12 shrink-0"><Plus className="h-4 w-4 mr-2"/>Outros</Button></div></div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3"><Label className="flex items-center gap-2 text-primary"><CalendarIcon className="h-4 w-4"/> Data</Label><DatePicker date={editArchivedDate} setDate={setEditArchivedDate} /></div>
                    <div className="space-y-3"><Label className="flex items-center gap-2 text-primary"><Clock className="h-4 w-4"/> Hora</Label><Input type="time" value={editArchivedTime} onChange={(e) => setEditArchivedTime(e.target.value)} className="h-10 text-lg" /></div>
                </div>
            </div>
            <DialogFooter className="flex gap-2 sm:gap-0"><Button variant="outline" onClick={() => { setArchivedItemToEdit(null); setActiveReportDateForAdd(null); }}>Cancelar</Button><Button onClick={() => handleUpsertArchivedItem(editArchivedInput, archivedItemToEdit)} disabled={isProcessingEdit || !editArchivedInput.trim()} className="bg-primary hover:bg-primary/90">{isProcessingEdit ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4 mr-2"/>} Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-primary/10 border-primary/20"><CardHeader className="p-4 pb-2"><CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2"><CalendarCheck className="h-3 w-3"/>Hoje</CardTitle></CardHeader><CardContent className="p-4 pt-0"><p className="text-2xl font-bold">{formatCurrency(dashboardStats.today)}</p></CardContent></Card>
          <Card><CardHeader className="p-4 pb-2"><CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2"><BarChart3 className="h-3 w-3"/>Semana</CardTitle></CardHeader><CardContent className="p-4 pt-0"><p className="text-2xl font-bold">{formatCurrency(dashboardStats.week)}</p></CardContent></Card>
          <Card><CardHeader className="p-4 pb-2"><CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2"><TrendingUp className="h-3 w-3"/>Mês</CardTitle></CardHeader><CardContent className="p-4 pt-0"><p className="text-2xl font-bold text-primary">{formatCurrency(dashboardStats.month)}</p></CardContent></Card>
          <Card><CardHeader className="p-4 pb-2"><CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2"><History className="h-3 w-3"/>Ano</CardTitle></CardHeader><CardContent className="p-4 pt-0"><p className="text-2xl font-bold">{formatCurrency(dashboardStats.year)}</p></CardContent></Card>
      </div>

      <Card className="mb-8 shadow-sm">
          <CardHeader className="pb-4"><CardTitle className="text-lg flex items-center gap-2"><CalendarIcon className="h-5 w-5 text-primary"/>Período de Referência</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                  <Select 
                    value={String(globalDate.getMonth())} 
                    onValueChange={(v) => {
                        const d = new Date(globalDate);
                        d.setDate(1); // Evita rollover (ex: 31 Jan -> 31 Fev -> 2 Mar)
                        d.setMonth(parseInt(v));
                        setGlobalDate(d);
                    }}
                  >
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({length: 12}, (_, i) => <SelectItem key={i} value={String(i)}>{format(new Date(2000, i), 'MMMM', { locale: ptBR })}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select 
                    value={String(globalDate.getFullYear())} 
                    onValueChange={(v) => {
                        const d = new Date(globalDate);
                        d.setDate(1);
                        d.setFullYear(parseInt(v));
                        setGlobalDate(d);
                    }}
                  >
                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{[2024, 2025].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
              </div>
              <p className="text-sm font-semibold text-muted-foreground capitalize">{safeFormat(globalDate, 'MMMM yyyy', { locale: ptBR })}</p>
          </CardContent>
      </Card>
      
      <main className="space-y-6 pb-32">
        <Accordion type="multiple" className="w-full space-y-4">
            <AccordionItem value="ai-insight">
                <Card className="border-primary/30 bg-primary/5">
                    <AccordionTrigger className="text-lg p-6 hover:no-underline"><div className="flex items-center gap-3"><Sparkles className="h-6 w-6 text-primary animate-pulse"/><span>Consultoria de Gestão (IA)</span></div></AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        <div className="text-center py-10 space-y-6">
                            {!aiReport && !isGeneratingAI && (
                                <div className="space-y-6">
                                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto"><Zap className="h-8 w-8 text-primary" /></div>
                                    <div className="max-w-md mx-auto space-y-2"><h3 className="font-bold text-lg">Pronto para o "Maxi Mode"?</h3><p className="text-sm text-muted-foreground">Analise vendas, compras e finanças com unificação inteligente.</p></div>
                                    <Button onClick={async () => {
                                        setIsGeneratingAI(true);
                                        try {
                                            const filteredReports = aiScope === 'month' ? monthlyReports : allReports;
                                            if (filteredReports.length === 0) { throw new Error("Sem dados."); }
                                            const sales = filteredReports.reduce((acc, r) => { acc.total += r.totalGeral; acc.fiado += r.totalFiado; mergeCounts(acc.items, r.contagemTotal); return acc; }, { total: 0, fiado: 0, items: {} as Record<string, number> });
                                            const report = await generateManagementReport({ periodLabel: safeFormat(globalDate, 'MMMM yyyy', { locale: ptBR }), salesData: sales, expenseData: { total: 0, items: {} } });
                                            setAiReport(report);
                                        } catch (e) { toast({ variant: 'destructive', title: "Erro na IA" }); } finally { setIsGeneratingAI(false); }
                                    }}><Sparkles className="mr-2 h-4 w-4" />Gerar Análise do Mês</Button>
                                </div>
                            )}
                            {aiReport && (
                                <div className="text-left space-y-6">
                                    <p className="text-sm italic border-l-4 border-primary/20 pl-4">"{aiReport.summary}"</p>
                                    <div className="bg-primary/10 p-4 rounded-md"><h4 className="font-bold text-xs uppercase text-primary mb-2">Plano de Ação</h4><p className="text-sm">{aiReport.strategicAdvice}</p></div>
                                    <Button variant="outline" size="sm" onClick={() => setAiReport(null)}>Limpar</Button>
                                </div>
                            )}
                        </div>
                    </AccordionContent>
                </Card>
            </AccordionItem>
            <AccordionItem value="diario"><Card><AccordionTrigger className="text-lg p-6 hover:no-underline"><div className="flex items-center gap-3"><CalendarDays className="h-6 w-6 text-primary"/><span>Relatórios Diários</span></div></AccordionTrigger><AccordionContent className="p-6 pt-0">{monthlyReports.length > 0 ? (<Accordion type="single" collapsible className="space-y-2">{monthlyReports.map(report => (<AccordionItem key={report.id} value={report.id!} className="border rounded-md px-4 hover:bg-muted/10"><AccordionTrigger className="hover:no-underline py-4"><div className="flex items-center justify-between w-full pr-4"><div className="flex items-center gap-4"><div className="text-center bg-background border rounded-md p-1 min-w-[50px]"><p className="text-xl font-bold leading-none">{safeFormat(parseISO(report.reportDate), 'dd')}</p><p className="text-[0.5rem] uppercase font-bold text-muted-foreground mt-1">{safeFormat(parseISO(report.reportDate), 'MMM', { locale: ptBR })}</p></div><div className="text-left"><p className="font-semibold capitalize text-sm">{safeFormat(parseISO(report.reportDate), "EEEE", { locale: ptBR })}</p><p className="text-[0.65rem] text-muted-foreground">{report.totalPedidos} pedidos</p></div></div><p className="text-base font-bold text-primary">{formatCurrency(report.totalGeral)}</p></div></AccordionTrigger><AccordionContent className="pt-2"><div className="flex justify-end gap-2 mb-4 px-4"><Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={() => setReportToDelete(report)}><Trash2 className="h-4 w-4 mr-2" /> Excluir</Button></div><ReportDetail report={report} onEditItem={setArchivedItemToEdit} onDeleteItem={setArchivedItemToDelete} onAddItem={(d) => { setActiveReportDateForAdd(d); setEditArchivedDate(parseISO(d)); }} /></AccordionContent></AccordionItem>))}</Accordion>) : <p className="text-center py-10 text-muted-foreground">Sem relatórios este mês.</p>}</AccordionContent></Card></AccordionItem>
            <AccordionItem value="clientes"><Card><AccordionTrigger className="text-lg p-6 hover:no-underline"><div className="flex items-center gap-3"><User className="h-6 w-6 text-primary"/><span>Consumo por Cliente (IA)</span></div></AccordionTrigger><AccordionContent className="p-6 pt-0"><CustomerReportsSection globalDate={globalDate} onEditItem={setArchivedItemToEdit} onDeleteItem={setArchivedItemToDelete} recalculateFn={recalculateReport}/></AccordionContent></Card></AccordionItem>
        </Accordion>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur-sm shadow-xl">
        <div className="container mx-auto max-w-5xl flex items-center justify-between p-4">
            <div className="flex flex-col">
                <span className="text-[0.65rem] font-black uppercase text-muted-foreground tracking-widest">Faturamento Total em {safeFormat(globalDate, 'MMMM', { locale: ptBR })}</span>
                <span className="text-3xl font-black text-primary leading-none tabular-nums">{formatCurrency(monthTotal)}</span>
            </div>
            <div className="flex gap-6 text-xs">
                <div className="text-right flex flex-col justify-center">
                    <p className="text-muted-foreground uppercase font-bold text-[0.6rem]">Relatórios</p>
                    <p className="font-bold text-lg leading-tight">{monthlyReports.length} <span className="text-[0.6rem] font-medium text-muted-foreground">dias</span></p>
                </div>
                <Separator orientation="vertical" className="h-10 bg-primary/20" />
                <div className="text-right flex flex-col justify-center">
                    <p className="text-muted-foreground uppercase font-bold text-[0.6rem]">Média Diária</p>
                    <p className="font-bold text-lg leading-tight text-foreground">{formatCurrency(monthlyReports.length ? monthTotal / monthlyReports.length : 0)}</p>
                </div>
            </div>
        </div>
      </footer>
    </>
  );
}