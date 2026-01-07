
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, FirebaseClientProvider } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowLeft, Users, ChevronDown, Info, ShieldX } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { Item, Group } from '@/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import PasswordDialog from '@/components/password-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { groupBadgeStyles, renderItemName } from '@/components/item-list';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatTimestamp = (timestamp: any) => {
  if (!timestamp) return '-';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if(isNaN(date.getTime())) return '-';
    return date.toLocaleDateString("pt-BR", {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return '-'; }
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

type CustomerData = {
    name: string;
    total: number;
    items: Item[];
}

function FiadosReportPageContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  
  const [currentMonth, setCurrentMonth] = useState(String(new Date().getMonth()));
  const [currentYear, setCurrentYear] = useState(String(new Date().getFullYear()));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
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

  const fiadoItemsQuery = useMemoFirebase(
    () => firestore && user 
        ? query(
            collection(firestore, 'users', user.uid, 'order_items'), 
            where('group', 'in', ['Fiados salão', 'Fiados rua']),
            orderBy('timestamp', 'desc')
          ) 
        : null,
    [firestore, user]
  );

  const { data: fiadoItems, isLoading: isLoadingItems } = useCollection<Item>(fiadoItemsQuery);
  const isLoading = isUserLoading || isLoadingItems;
  const yearOptions = useMemo(() => generateYearOptions(), []);

  const aggregatedData = useMemo(() => {
    if (!fiadoItems) return { customers: [], grandTotal: 0 };

    const year = parseInt(currentYear);
    const month = parseInt(currentMonth);
    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));

    const customerMap = new Map<string, CustomerData>();
    let grandTotal = 0;

    fiadoItems.forEach(item => {
        try {
            const itemDate = item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp);
            if (isWithinInterval(itemDate, { start: startDate, end: endDate }) && item.customerName) {
                const customerName = item.customerName;
                grandTotal += item.total;
                
                const existingCustomer = customerMap.get(customerName) || { name: customerName, total: 0, items: [] };
                existingCustomer.total += item.total;
                existingCustomer.items.push(item);
                customerMap.set(customerName, existingCustomer);
            }
        } catch {
            // Ignore items with invalid dates
        }
    });

    const customers = Array.from(customerMap.values()).sort((a,b) => b.total - a.total);

    return { customers, grandTotal };

  }, [fiadoItems, currentYear, currentMonth]);

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
              <p className="text-muted-foreground">Resumo mensal de valores em aberto por cliente.</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Fiado no Mês</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(aggregatedData.grandTotal)}</p>
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
                {aggregatedData.customers.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {aggregatedData.customers.map(customer => (
                             <AccordionItem value={customer.name} key={customer.name}>
                                <div className="bg-card p-2 rounded-lg border flex items-center gap-4">
                                    <div className="flex-grow">
                                        <p className="font-semibold text-foreground flex items-center gap-2">
                                            <Users className="h-4 w-4 text-muted-foreground"/>
                                            {customer.name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{customer.items.length} compra(s) neste período</p>
                                    </div>
                                    <div className="text-right mr-4">
                                        <p className="text-xs text-muted-foreground">Total no Mês</p>
                                        <p className="font-bold text-lg text-destructive">{formatCurrency(customer.total)}</p>
                                    </div>
                                    <AccordionTrigger>
                                        <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200" />
                                    </AccordionTrigger>
                                </div>
                                <AccordionContent className="p-2 pt-2">
                                     <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Data</TableHead>
                                                    <TableHead>Itens</TableHead>
                                                    <TableHead>Grupo</TableHead>
                                                    <TableHead className="text-right">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {customer.items.map(item => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="text-xs text-muted-foreground">{formatTimestamp(item.timestamp)}</TableCell>
                                                        <TableCell>{renderItemName(item)}</TableCell>
                                                        <TableCell><span className={cn('text-xs font-semibold', groupBadgeStyles[item.group])}>{item.group}</span></TableCell>
                                                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.total)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                ) : (
                    <Card>
                        <CardContent className="p-10 text-center text-muted-foreground">
                            <Info className="mx-auto h-8 w-8 mb-2"/>
                            <p>Nenhuma venda a fiado encontrada para o período selecionado.</p>
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

