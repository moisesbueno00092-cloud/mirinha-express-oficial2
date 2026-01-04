
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, setYear, setMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowLeft, Users, PiggyBank } from 'lucide-react';
import type { Item } from '@/types';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { renderItemName } from '@/components/item-list';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '-';
  try {
    return new Date(timestamp).toLocaleTimeString("pt-BR", {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '-';
  }
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


export default function FiadosReportPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));
  const yearOptions = useMemo(() => generateYearOptions(), []);

  const allItemsQuery = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'order_items'), where("userId", "==", user.uid), orderBy('timestamp', 'desc')) : null), [firestore, user]);
  const { data: allItems, isLoading: isLoadingItems } = useCollection<Item>(allItemsQuery);

  const fiadoReport = useMemo(() => {
    if (!allItems) return { clients: [], totalFiadoMonth: 0 };
    
    let referenceDate = setMonth(setYear(new Date(), selectedYear), parseInt(selectedMonth));
    const startDate = startOfMonth(referenceDate);
    const endDate = endOfMonth(referenceDate);
    
    const clientData: Record<string, { total: number, items: Item[] }> = {};
    let totalFiadoMonth = 0;

    const fiadoItemsThisMonth = allItems.filter(item => {
        if (!item.group?.includes('Fiado') || !item.customerName) return false;
        try {
            const itemDate = parseISO(item.timestamp);
            return isWithinInterval(itemDate, { start: startDate, end: endDate });
        } catch {
            return false;
        }
    });

    fiadoItemsThisMonth.forEach(item => {
        const clientName = item.customerName!;
        if (!clientData[clientName]) {
            clientData[clientName] = { total: 0, items: [] };
        }
        clientData[clientName].total += item.total;
        clientData[clientName].items.push(item);
        totalFiadoMonth += item.total;
    });

    const clients = Object.entries(clientData)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a,b) => a.name.localeCompare(b.name));

    return { clients, totalFiadoMonth };

  }, [allItems, selectedYear, selectedMonth]);


  if (isUserLoading || isLoadingItems) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatório de Fiados</h1>
              <p className="text-muted-foreground">Consolidado mensal das contas de clientes.</p>
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
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Total em Aberto no Mês</span>
                        <span className="text-destructive">{formatCurrency(fiadoReport.totalFiadoMonth)}</span>
                    </CardTitle>
                    <CardDescription>
                        {format(setMonth(new Date(), parseInt(selectedMonth)), 'MMMM', { locale: ptBR })} de {selectedYear}
                    </CardDescription>
                </CardHeader>
            </Card>
        
            <h2 className="text-xl font-semibold">Clientes do Mês</h2>

            {fiadoReport.clients.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-2">
                    {fiadoReport.clients.map(client => (
                        <AccordionItem value={client.name} key={client.name} className="border-b-0">
                            <div className="bg-card p-2 rounded-lg border flex items-center gap-4">
                                <div className="bg-amber-500 text-white rounded-md flex items-center justify-center w-12 h-12 shrink-0">
                                    <Users className="h-6 w-6" />
                                </div>
                                <div className="flex-grow">
                                    <p className="font-semibold text-foreground">{client.name}</p>
                                </div>
                                <div className="text-right mr-4">
                                    <p className="text-xs text-muted-foreground">Total do Mês</p>
                                    <p className="font-bold text-lg text-destructive">{formatCurrency(client.total)}</p>
                                </div>
                                <AccordionTrigger className="p-2 rounded-md hover:bg-accent [&[data-state=open]>svg]:rotate-180" />
                            </div>
                            <AccordionContent className="p-2 pt-2">
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="space-y-3">
                                            {client.items.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map(item => (
                                                <div key={item.id} className="flex justify-between items-start pb-3 border-b last:border-b-0">
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">{format(parseISO(item.timestamp), "dd/MM 'às' HH:mm")}</p>
                                                        {renderItemName(item)}
                                                    </div>
                                                    <div className="font-semibold text-right">
                                                        {formatCurrency(item.total)}
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
                        <PiggyBank className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum lançamento fiado para este mês.</p>
                    </CardContent>
                </Card>
            )}
        </main>
    </div>
  );
}
