'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, FirebaseClientProvider } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowLeft, Users, ChevronDown, User } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Item } from '@/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { renderItemName } from '@/components/item-list';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

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

function FiadosReportPageContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [currentMonth, setCurrentMonth] = useState(String(new Date().getMonth()));
  const [currentYear, setCurrentYear] = useState(String(new Date().getFullYear()));

  const fiadosQuery = useMemoFirebase(
    () => firestore && user ? query(
        collection(firestore, 'users', user.uid, 'order_items'),
        where('group', 'in', ['Fiados salão', 'Fiados rua']),
        orderBy('timestamp', 'desc')
    ) : null,
    [firestore, user]
  );

  const { data: allFiados, isLoading: isLoadingFiados } = useCollection<Item>(fiadosQuery);
  const isLoading = isUserLoading || isLoadingFiados;

  const yearOptions = useMemo(() => generateYearOptions(), []);

  const aggregatedFiados = useMemo(() => {
    if (!allFiados) return { customers: [], totalAmount: 0 };

    const year = parseInt(currentYear);
    const month = parseInt(currentMonth);

    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));
  
    const filtered = allFiados.filter(item => {
      try {
        const itemDate = new Date(item.timestamp);
        return isWithinInterval(itemDate, { start: startDate, end: endDate });
      } catch {
        return false;
      }
    });
    
    const customerMap = new Map<string, { total: number; items: Item[] }>();
    let totalAmount = 0;

    for (const item of filtered) {
        if (!item.customerName) continue;
        
        totalAmount += item.total;
        const customerKey = item.customerName.toLowerCase();
        const existing = customerMap.get(customerKey) || { total: 0, items: [] };

        customerMap.set(customerKey, {
            total: existing.total + item.total,
            items: [...existing.items, item],
        });
    }

    const customers = Array.from(customerMap.entries())
        .map(([name, data]) => ({
            name: data.items[0].customerName!, // Preserve original casing
            ...data,
        }))
        .sort((a,b) => b.total - a.total);

    return { customers, totalAmount };

  }, [allFiados, currentYear, currentMonth]);
  
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/reports" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatório de Fiados</h1>
              <p className="text-muted-foreground">Consolidação mensal das contas de clientes.</p>
            </div>
          </div>
        </header>

        <main className="space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                        <div>
                            <CardTitle>Filtros</CardTitle>
                            <CardDescription>Selecione o período para o relatório.</CardDescription>
                        </div>
                        <div className="mt-4 sm:mt-0 text-right">
                            <p className="text-sm text-muted-foreground">Total Fiado no Período</p>
                            <p className="text-2xl font-bold text-destructive">{formatCurrency(aggregatedFiados.totalAmount)}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-center">
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

            <div className="space-y-2">
                {aggregatedFiados.customers.length > 0 ? (
                    <Accordion type="multiple" className="w-full space-y-2">
                        {aggregatedFiados.customers.map(customer => (
                            <AccordionItem value={customer.name} key={customer.name}>
                                <div className="bg-card p-2 rounded-lg border flex items-center gap-4">
                                    <div className="flex items-center justify-center w-12 h-12 shrink-0 rounded-md bg-destructive/10">
                                        <User className="h-6 w-6 text-destructive"/>
                                    </div>
                                    <div className="flex-grow">
                                        <p className="font-semibold text-foreground">{customer.name}</p>
                                        <p className="text-sm text-muted-foreground">{customer.items.length} compra(s) no período</p>
                                    </div>
                                    <div className="text-right mr-4">
                                        <p className="text-xs text-muted-foreground">Total a Pagar</p>
                                        <p className="font-bold text-lg text-destructive">{formatCurrency(customer.total)}</p>
                                    </div>
                                    <AccordionTrigger>
                                        <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200" />
                                    </AccordionTrigger>
                                </div>
                                <AccordionContent className="p-2 pt-2">
                                     <Card>
                                        <CardContent className="p-4">
                                             <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Data</TableHead>
                                                        <TableHead>Itens</TableHead>
                                                        <TableHead className="text-right">Valor</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {customer.items.map(item => (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                                {format(new Date(item.timestamp), 'dd/MM/yy HH:mm')}
                                                            </TableCell>
                                                            <TableCell>
                                                                {renderItemName(item)}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-semibold">
                                                                {formatCurrency(item.total)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                     </Card>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                ) : (
                    <Card>
                        <CardContent className="p-10 text-center text-muted-foreground flex flex-col items-center gap-4">
                            <Users className="h-10 w-10" />
                            <p>Nenhum fiado encontrado para o período selecionado.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    </div>
  );
}

export default function FiadosReportPage() {
    return (
        <FirebaseClientProvider>
            <FiadosReportPageContent />
        </FirebaseClientProvider>
    )
}
