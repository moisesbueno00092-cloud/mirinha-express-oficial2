
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
    setYear,
    setMonth,
    isValid,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
    Loader2, 
    Trash2, 
    CalendarDays, 
    ListOrdered, 
    User, 
    Eye, 
    Calendar as CalendarIcon, 
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
import type { 
    DailyReport, 
    ItemCount, 
    BomboniereItem, 
    Item, 
    Group, 
    SavedFavorite 
} from '@/types';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ItemList from '@/components/item-list';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp-icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import usePersistentState from '@/hooks/use-persistent-state';
import { PREDEFINED_PRICES, DELIVERY_FEE } from '@/lib/constants';
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

// Seção de Consumo por Cliente (Mensal) - Atualizado para tempo real
const CustomerReportsSection = ({ 
    globalDate,
    onEditItem,
    onDeleteItem
}: { 
    globalDate: Date,
    onEditItem: (item: Item) => void,
    onDeleteItem: (item: Item) => void
}) => {
    const firestore = useFirestore();
    const { toast } = useToast();
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
                    const getT = (ts: any) => (ts?.toMillis ? ts.toMillis() : new Date(ts).getTime() || 0);
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
        const monthName = safeFormat(globalDate, 'MMM/yy', { locale: ptBR }).toUpperCase();
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
                description: `O extrato de ${customer.name} foi copiado para a área de transferência.`,
            });
        });
    };

    return (
        <div className="space-y-6">
            <Dialog open={!!selectedCustomerName} onOpenChange={(open) => { if(!open) setSelectedCustomerName(null); }}>
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
                            Consumo mensal detalhado em {safeFormat(globalDate, 'MMMM yyyy', { locale: ptBR })}.
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
                                    {formatCurrency(selectedCustomer?.total)}
                                </span>
                            </div>
                            <Button variant="outline" onClick={() => setSelectedCustomerName(null)}>Fechar</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                            {customerData.map((cust) => (
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
                        <p>Nenhum consumo identificado para este mês.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

// Detalhes de um Relatório Diário
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
    const firestore = useFirestore();
    const archivedItemsQuery = useMemo(() => {
        if (!firestore || !report?.reportDate) return null;
        return query(collection(firestore, 'order_items'), where('reportDate', '==', report.reportDate));
    }, [firestore, report?.reportDate]);

    const { data: rawItems, isLoading } = useCollection<Item>(archivedItemsQuery);

    const sortedItems = useMemo(() => {
        if (!rawItems) return [];
        return [...rawItems].sort((a, b) => {
            const getT = (ts: any) => (ts?.toMillis ? ts.toMillis() : new Date(ts).getTime() || 0);
            return getT(a.timestamp) - getT(b.timestamp);
        });
    }, [rawItems]);

    const isBomboniere = (itemName: string): boolean => {
      if (!bomboniereItems) return false;
      const lowerItemName = itemName.toLowerCase();
      return bomboniereItems.some(bi => bi.name.toLowerCase() === lowerItemName);
    };
    
    const separateItemsByCategory = (itemCount: ItemCount) => {
        const lanches: ItemCount = {};
        const bomboniere: ItemCount = {};
        if (!itemCount) return { lanches, bomboniere };

        for (const [name, count] of Object.entries(itemCount)) {
            if (isBomboniere(name)) {
                bomboniere[name] = (bomboniere[name] || 0) + count;
            } else {
                lanches[name] = (lanches[name] || 0) + count;
            }
        }
        return { lanches, bomboniere };
    };
    
    if (!report) return null;

    const { lanchesSalao, bomboniereSalao, lanchesRua, bomboniereRua } = useMemo(() => {
        const contagemSalao: ItemCount = {};
        if (report.contagemTotal) {
            for (const key in report.contagemTotal) {
                const totalCount = report.contagemTotal[key] || 0;
                const ruaCount = report.contagemRua?.[key] || 0;
                const salaoCount = totalCount - ruaCount;
                if (salaoCount > 0) contagemSalao[key] = salaoCount;
            }
        }
        const contagemRua = report.contagemRua || {};
        const { lanches: lS, bomboniere: bS } = separateItemsByCategory(contagemSalao);
        const { lanches: lR, bomboniere: bR } = separateItemsByCategory(contagemRua);
        return { lanchesSalao: lS, bomboniereSalao: bS, lanchesRua: lR, bomboniereRua: bR };
    }, [report.contagemTotal, report.contagemRua, bomboniereItems]);

    const renderItemCountList = (counts: ItemCount) => {
      const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
      if (sorted.length === 0) return null;
      return (
        <ul className="text-xs space-y-0.5 mt-2">
            {sorted.map(([name, count]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="font-bold w-6 text-right">{count}</span>
                  <span>{name}</span>
                </li>
            ))}
        </ul>
      );
    }

  return (
    <div className="space-y-8 pt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Resumo Financeiro</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between items-center"><span className="text-purple-400">Vendas Salão:</span> <span className="font-mono">{formatCurrency(report.totalVendasSalao)}</span></div>
              <div className="flex justify-between items-center"><span className="text-blue-400">Vendas Rua:</span> <span className="font-mono">{formatCurrency(report.totalVendasRua)}</span></div>
              <div className="flex justify-between items-center text-destructive"><span>Fiado Salão:</span> <span className="font-mono">{formatCurrency(report.totalFiadoSalao)}</span></div>
              <div className="flex justify-between items-center text-destructive"><span>Fiado Rua:</span> <span className="font-mono">{formatCurrency(report.totalFiadoRua)}</span></div>
            </div>
          </div>
          <Separator/>
          <div className="space-y-1 text-sm">
              <div className="flex justify-between items-center text-destructive"><span>Total Entregas:</span> <span className="font-mono font-bold">{report.totalEntregas || 0} ({formatCurrency(report.totalTaxas)})</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span>Total Geral (Itens):</span> <span className="font-mono font-bold text-foreground">{report.totalItens || 0}</span></div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
              <h3 className="font-semibold mb-2">Contagem de Itens</h3>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
                    <div>
                        <h4 className="font-medium text-xs text-purple-400 border-b border-purple-400/30 pb-1">Salão</h4>
                        {renderItemCountList(lanchesSalao)}
                        {renderItemCountList(bomboniereSalao)}
                    </div>
                    <Separator orientation="vertical" />
                    <div>
                        <h4 className="font-medium text-xs text-blue-400 border-b border-blue-400/30 pb-1">Rua</h4>
                        {renderItemCountList(lanchesRua)}
                        {renderItemCountList(bomboniereRua)}
                    </div>
              </div>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t pt-6">
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold flex items-center gap-2">
                    <ListOrdered className="h-5 w-5 text-primary" />
                    Listagem de Pedidos Detalhada
                </h4>
                <Button variant="outline" size="sm" onClick={() => onAddItem(report.reportDate)}>
                    <Plus className="h-4 w-4 mr-2" /> Novo Item
                </Button>
            </div>
            {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                <div className="rounded-md border">
                    <ItemList 
                        items={sortedItems} 
                        isLoading={false} 
                        onEdit={onEditItem}
                        onDelete={(id) => {
                            const item = sortedItems.find(it => it.id === id);
                            if (item) onDelete(item);
                        }}
                    />
                </div>
            )}
        </div>
    </div>
  )
};

function ReportsPageContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  
  const [globalDate, setGlobalDate] = useState<Date>(new Date());

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
  
  const [isBomboniereModalOpen, setIsBomboniereModalOpen] = useState(false);
  const [deliveryFee] = usePersistentState('deliveryFee', DELIVERY_FEE);
  
  const allReportsQuery = useMemo(() => firestore ? query(collection(firestore, 'daily_reports')) : null, [firestore]);
  const { data: allReportsRaw, isLoading: isLoadingReports } = useCollection<DailyReport>(allReportsQuery);

  const allReports = useMemo(() => {
    if (!allReportsRaw) return [];
    return [...allReportsRaw].filter(r => r.reportDate).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  }, [allReportsRaw]);

  const monthlyReports = useMemo(() => {
    return allReports.filter(r => {
        const d = parseISO(r.reportDate);
        return d.getFullYear() === globalDate.getFullYear() && d.getMonth() === globalDate.getMonth();
    });
  }, [allReports, globalDate]);

  const { data: bomboniereItems } = useCollection<BomboniereItem>(firestore ? collection(firestore, 'bomboniere_items') : null);

  useEffect(() => {
    if (archivedItemToEdit) {
        setEditArchivedInput(archivedItemToEdit.originalCommand || '');
        const itemDate = archivedItemToEdit.timestamp?.toDate ? archivedItemToEdit.timestamp.toDate() : new Date(archivedItemToEdit.timestamp);
        if (isValid(itemDate)) {
            setEditArchivedDate(itemDate);
            setEditArchivedTime(format(itemDate, 'HH:mm'));
        }
    }
  }, [archivedItemToEdit]);

  const recalculateReport = async (reportDate: string) => {
    if (!firestore || !user?.uid) return;
    try {
        const snapshot = await getDocs(query(collection(firestore, 'order_items'), where('reportDate', '==', reportDate)));
        const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Item));
        const reportSnapshot = await getDocs(query(collection(firestore, 'daily_reports'), where('reportDate', '==', reportDate)));
        
        if (items.length === 0) {
            if (!reportSnapshot.empty) await deleteDoc(reportSnapshot.docs[0].ref);
            return;
        }

        const totals = items.reduce((acc, item) => {
            acc.totalGeral += item.total; acc.totalItens += item.quantity; acc.totalTaxas += item.deliveryFee;
            const itemIsRua = item.group.includes('rua');
            if (itemIsRua) { if (item.deliveryFee > 0) acc.totalEntregas++; acc.totalItensRua += item.quantity; }
            if (item.group.includes('Fiados')) acc.totalFiado += item.total; else acc.totalAVista += item.total;
            switch (item.group) {
                case 'Vendas salão': acc.totalVendasSalao += item.total; break;
                case 'Vendas rua': acc.totalVendasRua += item.total; break;
                case 'Fiados salão': acc.totalFiadoSalao += item.total; break;
                case 'Fiados rua': acc.totalFiadoRua += item.total; break;
            }
            return acc;
        }, { totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0, totalVendasRua: 0, totalFiadoSalao: 0, totalFiadoRua: 0, totalTaxas: 0, totalItens: 0, totalEntregas: 0, totalItensRua: 0, contagemTotal: {} as ItemCount, contagemRua: {} as ItemCount });

        if (!reportSnapshot.empty) {
            await setDoc(reportSnapshot.docs[0].ref, { ...totals, totalPedidos: items.length, reportDate, userId: user.uid }, { merge: true });
        } else {
            await addDoc(collection(firestore, 'daily_reports'), { ...totals, totalPedidos: items.length, reportDate, userId: user.uid, createdAt: new Date().toISOString() });
        }
    } catch (e) { console.error(e); }
  };

  const handleUpsertArchivedItem = async (rawInput: string, currentItem?: Item | null) => {
    if (!firestore || !user?.uid || !editArchivedDate) return;
    setIsProcessingEdit(true);
    const [h, m] = editArchivedTime.split(':').map(Number);
    const finalDate = new Date(editArchivedDate); 
    
    // Preservar segundos e ms originais se estiver a editar
    if (currentItem?.timestamp) {
        const origTs = currentItem.timestamp.toDate ? currentItem.timestamp.toDate() : new Date(currentItem.timestamp);
        finalDate.setHours(h, m, origTs.getSeconds(), origTs.getMilliseconds());
    } else {
        finalDate.setHours(h, m, 0, 0);
    }
    
    const newReportDateStr = format(finalDate, 'yyyy-MM-dd');

    try {
        const batch = writeBatch(firestore);
        let mainInput = rawInput.trim();
        let group: Group = 'Vendas salão';
        let deliveryFeeApplicable = false;
        let isTaxExempt = mainInput.toUpperCase().includes(' E ');
        if (isTaxExempt) mainInput = mainInput.replace(/ E /gi, ' ').trim();

        if (mainInput.toUpperCase().startsWith('R ')) { group = 'Vendas rua'; deliveryFeeApplicable = true; mainInput = mainInput.substring(2).trim(); }
        else if (mainInput.toUpperCase().startsWith('FR ')) { group = 'Fiados rua'; deliveryFeeApplicable = true; mainInput = mainInput.substring(3).trim(); }
        else if (mainInput.toUpperCase().startsWith('F ')) { group = 'Fiados salão'; mainInput = mainInput.substring(2).trim(); }

        const parts = mainInput.split(' ').filter(p => p);
        let totalPrice = 0; let totalQty = 0;
        parts.forEach(p => {
            if (isNumeric(p)) totalPrice += parseFloat(p.replace(',', '.'));
            else totalQty++;
        });

        const finalFee = isTaxExempt ? 0 : deliveryFeeApplicable ? deliveryFee : 0;
        const total = totalPrice + finalFee;

        const finalItem: Omit<Item, 'id'> = {
            userId: user.uid, name: 'Lançamento Histórico', quantity: totalQty || 1, price: totalPrice,
            group, timestamp: Timestamp.fromDate(finalDate), deliveryFee: finalFee, total,
            originalCommand: rawInput, reportado: true, reportDate: newReportDateStr,
        };

        if (currentItem) batch.set(doc(firestore, 'order_items', currentItem.id), finalItem);
        else batch.set(doc(collection(firestore, 'order_items')), finalItem);

        await batch.commit();
        await recalculateReport(newReportDateStr);
        if (currentItem?.reportDate && currentItem.reportDate !== newReportDateStr) await recalculateReport(currentItem.reportDate);

        toast({ title: 'Sucesso', description: 'O lançamento foi atualizado.' });
        setArchivedItemToEdit(null); setActiveReportDateForAdd(null);
    } catch (e) { console.error(e); } finally { setIsProcessingEdit(false); }
  };

  const confirmEditDate = async () => {
    if (!firestore || !reportToEditDate || !newReportDate) return;
    setIsUpdatingDate(true);
    const oldDateStr = reportToEditDate.reportDate;
    const newDateStr = format(newReportDate, 'yyyy-MM-dd');

    try {
        const batch = writeBatch(firestore);
        batch.update(doc(firestore, "daily_reports", reportToEditDate.id!), { reportDate: newDateStr });

        const snapshot = await getDocs(query(collection(firestore, 'order_items'), where('reportDate', '==', oldDateStr)));
        snapshot.forEach(orderDoc => {
            const data = orderDoc.data() as Item;
            const originalTs = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            const updatedTs = new Date(newReportDate);
            updatedTs.setHours(originalTs.getHours(), originalTs.getMinutes(), originalTs.getSeconds(), originalTs.getMilliseconds());
            
            batch.update(orderDoc.ref, { 
                reportDate: newDateStr,
                timestamp: Timestamp.fromDate(updatedTs)
            });
        });

        await batch.commit();
        toast({ title: "Sincronização Concluída", description: "O relatório e todos os pedidos foram movidos." });
    } catch (e) { console.error(e); } finally { setIsUpdatingDate(false); setReportToEditDate(null); }
  };

  const confirmDeleteReport = async () => {
    if (!firestore || !reportToDelete?.reportDate) return;
    try {
        const batch = writeBatch(firestore);
        const snapshot = await getDocs(query(collection(firestore, 'order_items'), where('reportDate', '==', reportToDelete.reportDate)));
        snapshot.forEach(d => {
            batch.set(doc(collection(firestore, 'live_items'), d.id), { ...d.data(), reportado: false });
            batch.delete(d.ref);
        });
        batch.delete(doc(firestore, "daily_reports", reportToDelete.id!));
        await batch.commit();
        toast({ title: "Relatório Excluído" });
    } catch (e) { console.error(e); } finally { setReportToDelete(null); }
  };

  if (isUserLoading || isLoadingReports) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  return (
    <>
      <BomboniereModal isOpen={isBomboniereModalOpen} onClose={() => setIsBomboniereModalOpen(false)} onAddItems={(items) => setEditArchivedInput(prev => `${prev} ${items.map(i => `${i.quantity} ${i.name}`).join(' ')}`)} bomboniereItems={bomboniereItems || []} />

      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir Relatório?</AlertDialogTitle><AlertDialogDescription>Os itens voltarão para a tela inicial.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteReport}>Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archivedItemToDelete} onOpenChange={(open) => !open && setArchivedItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir Lançamento do Histórico?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => {
              if (archivedItemToDelete) {
                  await deleteDoc(doc(firestore!, 'order_items', archivedItemToDelete.id));
                  if (archivedItemToDelete.reportDate) await recalculateReport(archivedItemToDelete.reportDate);
                  setArchivedItemToDelete(null);
              }
          }} className="bg-destructive">Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!archivedItemToEdit || !!activeReportDateForAdd} onOpenChange={(open) => { if(!open) { setArchivedItemToEdit(null); setActiveReportDateForAdd(null); } }}>
        <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader><DialogTitle>{archivedItemToEdit ? 'Editar' : 'Novo'} Lançamento</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
                <div className="space-y-2">
                    <Label>Comando</Label>
                    <div className="flex gap-2">
                        <Input value={editArchivedInput} onChange={(e) => setEditArchivedInput(e.target.value)} placeholder="Ex: M P coca-lata" className="h-12" />
                        <Button variant="outline" onClick={() => setIsBomboniereModalOpen(true)} className="h-12">Outros</Button>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Data</Label><div className="border rounded-md p-2 bg-background flex justify-center"><Calendar mode="single" selected={editArchivedDate} onSelect={setEditArchivedDate} locale={ptBR} /></div></div>
                    <div className="space-y-2"><Label>Hora</Label><Input type="time" value={editArchivedTime} onChange={(e) => setEditArchivedTime(e.target.value)} className="h-10" /></div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => { setArchivedItemToEdit(null); setActiveReportDateForAdd(null); }}>Cancelar</Button>
                <Button onClick={() => handleUpsertArchivedItem(editArchivedInput, archivedItemToEdit)} disabled={isProcessingEdit || !editArchivedInput.trim()} >{isProcessingEdit ? <Loader2 className="animate-spin mr-2" /> : <Pencil className="mr-2 h-4 w-4" />}Salvar</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!reportToEditDate} onOpenChange={(open) => { if (!open) setReportToEditDate(null)}}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader><DialogTitle>Alterar Data do Relatório</DialogTitle></DialogHeader>
            <div className="py-4 flex flex-col items-center bg-muted/30 rounded-md">
                <Calendar mode="single" selected={newReportDate} onSelect={setNewReportDate} locale={ptBR} className="border rounded-md bg-background" />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setReportToEditDate(null)}>Cancelar</Button>
                <Button onClick={confirmEditDate} disabled={isUpdatingDate || !newReportDate}>{isUpdatingDate ? <Loader2 className="animate-spin mr-2"/> : 'Confirmar'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mb-8">
          <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><CalendarIcon className="h-5 w-5 text-primary"/>Período de Visualização</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                  <Select value={String(globalDate.getMonth())} onValueChange={(v) => setGlobalDate(setMonth(new Date(globalDate), parseInt(v)))}>
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{Array.from({length: 12}, (_, i) => <SelectItem key={i} value={String(i)}>{format(new Date(2000, i), 'MMMM', { locale: ptBR })}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={String(globalDate.getFullYear())} onValueChange={(v) => setGlobalDate(setYear(new Date(globalDate), parseInt(v)))}>
                      <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{[2024, 2025].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
              </div>
              <p className="text-sm text-muted-foreground capitalize">{safeFormat(globalDate, 'MMMM yyyy', { locale: ptBR })}</p>
          </CardContent>
      </Card>
      
      <main className="space-y-6">
        <Accordion type="single" collapsible defaultValue="diario" className="w-full space-y-4">
            <AccordionItem value="diario">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline"><div className="flex items-center gap-3"><CalendarDays className="h-6 w-6 text-primary"/><span>Relatórios Diários</span></div></AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        {monthlyReports.length > 0 ? (
                            <div className="space-y-4">
                                {monthlyReports.map(report => (
                                    <Card key={report.id} className="overflow-hidden">
                                        <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="text-center bg-background border rounded-md p-2 min-w-[60px]">
                                                    <p className="text-2xl font-bold leading-none">{safeFormat(parseISO(report.reportDate), 'dd')}</p>
                                                    <p className="text-[0.6rem] uppercase font-bold text-muted-foreground mt-1">{safeFormat(parseISO(report.reportDate), 'MMM', { locale: ptBR })}</p>
                                                </div>
                                                <div>
                                                    <p className="font-semibold capitalize">{safeFormat(parseISO(report.reportDate), "EEEE", { locale: ptBR })}</p>
                                                    <p className="text-xs text-muted-foreground">{report.totalPedidos} pedidos registados</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-[0.65rem] uppercase font-bold text-muted-foreground leading-none">Total</p>
                                                    <p className="text-lg font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => { setReportToEditDate(report); setNewReportDate(parseISO(report.reportDate)); }}><CalendarDays className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setReportToDelete(report)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4 pt-0 border-t bg-muted/5">
                                            <ReportDetail report={report} bomboniereItems={bomboniereItems || []} onEditItem={setArchivedItemToEdit} onDeleteItem={setArchivedItemToDelete} onAddItem={(d) => { setActiveReportDateForAdd(d); setEditArchivedDate(parseISO(d)); }} />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : <p className="text-center py-10 text-muted-foreground">Sem relatórios para este mês.</p>}
                    </AccordionContent>
                </Card>
            </AccordionItem>

            <AccordionItem value="clientes">
                <Card>
                    <AccordionTrigger className="text-lg p-6 hover:no-underline"><div className="flex items-center gap-3"><User className="h-6 w-6 text-primary"/><span>Consumo por Cliente (Mensal)</span></div></AccordionTrigger>
                    <AccordionContent className="p-6 pt-0">
                        <CustomerReportsSection globalDate={globalDate} onEditItem={setArchivedItemToEdit} onDeleteItem={setArchivedItemToDelete} />
                    </AccordionContent>
                </Card>
            </AccordionItem>
        </Accordion>
      </main>
    </>
  );
}

export default function ReportsPage() {
    return <ReportsPageContent />;
}
