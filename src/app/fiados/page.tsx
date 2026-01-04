'use client';

import { useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, writeBatch, doc } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, setYear, setMonth, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowLeft, ChevronDown, Trash2, Info, Users, FileText, XCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { renderItemName, groupBadgeStyles } from '@/components/item-list';
import type { Item } from '@/types';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp-icon';
import { Badge } from '@/components/ui/badge';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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
    { value: 'all', label: 'Todos os Meses' },
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

interface ClientReport {
    name: string;
    items: Item[];
    total: number;
}

export default function FiadosPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [itemsToSettle, setItemsToSettle] = useState<Item[]>([]);

    const yearOptions = useMemo(() => generateYearOptions(), []);

    const fiadosQuery = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'order_items'), 
            where("userId", "==", user.uid),
            where("group", "in", ["Fiados salão", "Fiados rua"]),
            orderBy('timestamp', 'desc')
        );
    }, [firestore, user]);

    const { data: fiadoItems, isLoading: isLoadingFiados } = useCollection<Item>(fiadosQuery);

    const clientReports = useMemo((): ClientReport[] => {
        if (!fiadoItems) return [];
        
        let dateFilteredItems = fiadoItems;

        if (selectedMonth !== 'all') {
            const referenceDate = setMonth(setYear(new Date(), selectedYear), parseInt(selectedMonth, 10));
            const startDate = startOfMonth(referenceDate);
            const endDate = endOfMonth(referenceDate);
            
            dateFilteredItems = fiadoItems.filter(item => {
                try {
                    const itemDate = new Date(item.timestamp);
                    return isWithinInterval(itemDate, { start: startDate, end: endDate });
                } catch {
                    return false;
                }
            });
        } else {
             const referenceDate = setYear(new Date(), selectedYear);
             const startDate = startOfYear(referenceDate);
             const endDate = endOfYear(referenceDate);

             dateFilteredItems = fiadoItems.filter(item => {
                 try {
                     const itemDate = new Date(item.timestamp);
                     return isWithinInterval(itemDate, { start: startDate, end: endDate });
                 } catch {
                     return false;
                 }
            })
        }

        const reportsMap = new Map<string, ClientReport>();

        for (const item of dateFilteredItems) {
            const clientName = item.customerName || 'Cliente Desconhecido';
            const report = reportsMap.get(clientName) || { name: clientName, items: [], total: 0 };
            
            report.items.push(item);
            report.total += item.total;
            reportsMap.set(clientName, report);
        }

        return Array.from(reportsMap.values()).sort((a,b) => a.name.localeCompare(b.name));
    }, [fiadoItems, selectedYear, selectedMonth]);

    const handleSettleUpRequest = (items: Item[]) => {
        setItemsToSettle(items);
    }
    
    const confirmSettleUp = async () => {
        if (!firestore || itemsToSettle.length === 0) return;
    
        const batch = writeBatch(firestore);
        itemsToSettle.forEach(item => {
            const docRef = doc(firestore, 'order_items', item.id);
            // Instead of deleting, we change the group to settled
            const newGroup = item.group === 'Fiados rua' ? 'Vendas rua' : 'Vendas salão';
            batch.update(docRef, { group: newGroup });
        });
    
        try {
            await batch.commit();
            toast({
                title: "Sucesso!",
                description: `${itemsToSettle.length} lançamentos foram liquidados para ${itemsToSettle[0].customerName}.`,
                className: "bg-green-500 text-white"
            });
        } catch (error) {
            console.error("Error settling up items: ", error);
            toast({
                variant: 'destructive',
                title: 'Erro ao liquidar',
                description: 'Não foi possível atualizar os lançamentos.'
            });
        } finally {
            setItemsToSettle([]);
        }
    };
    
    const generateWhatsAppMessage = (report: ClientReport) => {
        const header = `Olá, ${report.name}! Segue o extrato dos seus fiados para o período de ${selectedMonth === 'all' ? `todo o ano de ${selectedYear}` : `${monthOptions.find(m => m.value === selectedMonth)?.label} de ${selectedYear}`}:\n\n`;
        
        const itemsList = report.items.map(item => {
            const date = format(parseISO(item.timestamp), 'dd/MM');
            return `*${date}* - ${item.originalCommand || item.name} - ${formatCurrency(item.total)}`;
        }).join('\n');

        const footer = `\n\n*Total: ${formatCurrency(report.total)}*`;

        return encodeURIComponent(header + itemsList + footer);
    }

    if (isUserLoading || isLoadingFiados) {
        return (
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        );
    }

    return (
        <>
        <AlertDialog open={itemsToSettle.length > 0} onOpenChange={(open) => !open && setItemsToSettle([])}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Liquidação?</AlertDialogTitle>
                <AlertDialogDescription>
                Você está prestes a liquidar <span className='font-bold'>{itemsToSettle.length}</span> lançamento(s) para o cliente <span className='font-bold'>{itemsToSettle[0]?.customerName}</span>, no valor total de <span className='font-bold'>{formatCurrency(itemsToSettle.reduce((sum, item) => sum + item.total, 0))}</span>.
                Esta ação irá converter os itens "Fiado" em "Venda", removendo-os deste relatório. A ação não pode ser desfeita.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-green-600 hover:bg-green-700" onClick={confirmSettleUp}>Sim, Liquidar Conta</AlertDialogAction>
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
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatório de Fiados</h1>
                        <p className="text-muted-foreground">Consolidação das contas de clientes fiado por período.</p>
                    </div>
                </div>
                <div className='flex items-end gap-2'>
                    <div className='w-48 space-y-1'>
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

            <main>
                {clientReports.length > 0 ? (
                    <Accordion type="multiple" className="w-full space-y-2">
                        {clientReports.map(report => (
                            <AccordionItem value={report.name} key={report.name} className="border-b-0">
                                <div className="bg-card p-2 rounded-lg border flex items-center gap-4">
                                    <div className="bg-destructive/10 text-destructive rounded-md flex flex-col items-center justify-center w-16 h-16 shrink-0">
                                        <Users className="h-6 w-6"/>
                                    </div>

                                    <div className="flex-grow">
                                        <p className="font-semibold text-foreground">{report.name}</p>
                                        <p className="text-sm text-muted-foreground">{report.items.length} lançamento(s) no período</p>
                                    </div>

                                    <div className="text-right mr-4">
                                        <p className="text-xs text-muted-foreground">Total Fiado</p>
                                        <p className="font-bold text-lg text-destructive">{formatCurrency(report.total)}</p>
                                    </div>
                                    
                                     <Button variant="ghost" className='h-9 w-9 p-0' asChild>
                                        <a href={`https://wa.me/?text=${generateWhatsAppMessage(report)}`} target="_blank" rel="noopener noreferrer">
                                            <WhatsAppIcon className="h-5 w-5 text-green-500" />
                                        </a>
                                    </Button>

                                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => handleSettleUpRequest(report.items)}>
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    </Button>

                                    <AccordionTrigger className='p-2'>
                                        <span className='sr-only'>Expandir</span>
                                    </AccordionTrigger>
                                </div>
                                <AccordionContent className="p-2 pt-2">
                                     <Card>
                                        <CardContent className="p-4">
                                            <div className="space-y-4">
                                            {report.items.map(item => (
                                                <div key={item.id} className="flex justify-between items-start pb-2 border-b border-dashed last:border-b-0">
                                                    <div>
                                                        <span className="text-sm text-muted-foreground mr-4">{format(new Date(item.timestamp), 'dd/MM/yy HH:mm')}</span>
                                                        {renderItemName(item)}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-semibold">{formatCurrency(item.total)}</div>
                                                        <Badge className={cn("whitespace-nowrap mt-1", groupBadgeStyles[item.group] || "bg-gray-500")}>
                                                            {item.group}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                ) : (
                    <Card>
                        <CardContent className="p-10 text-center text-muted-foreground">
                            <Info className="mx-auto h-8 w-8 mb-2"/>
                            <p>Nenhum lançamento de fiado encontrado para o período selecionado.</p>
                        </CardContent>
                    </Card>
                )}
            </main>
        </div>
        </>
    );
}