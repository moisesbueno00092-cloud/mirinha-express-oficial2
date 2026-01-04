
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, writeBatch, doc, orderBy } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth, setYear, setMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { FavoriteClient, FavoriteClientEntry, Item } from '@/types';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Users, HandCoins, Calendar, Info } from 'lucide-react';
import { renderItemName } from '../item-list';

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


export default function FechamentoFavoritosPanel() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const yearOptions = useMemo(() => generateYearOptions(), []);

  const favoriteClientsQuery = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, "favorite_clients"), where("userId", "==", user.uid), orderBy('name', 'asc')) : null),
    [firestore, user]
  );
  const { data: favoriteClients, isLoading: isLoadingFavorites } = useCollection<FavoriteClient>(favoriteClientsQuery);

  const entriesQuery = useMemoFirebase(() => {
    if (!firestore || !user ) return null;
    return query(
      collection(firestore, "favorite_client_entries"),
      where("userId", "==", user.uid)
    );
  }, [firestore, user]);

  const { data: allEntries, isLoading: isLoadingEntries } = useCollection<FavoriteClientEntry>(entriesQuery);
  
  const orderItemsQuery = useMemoFirebase(() => {
    if (!firestore || !user ) return null;
     return query(
      collection(firestore, "order_items"),
      where("userId", "==", user.uid)
    );
  }, [firestore, user]);
  const { data: allOrderItems, isLoading: isLoadingOrderItems } = useCollection<Item>(orderItemsQuery);

  const orderItemsMap = useMemo(() => {
    if (!allOrderItems) return new Map<string, Item>();
    return new Map(allOrderItems.map(item => [item.id, item]));
  }, [allOrderItems]);
  
  const clientData = useMemo(() => {
    if (!selectedClientId || !allEntries) return { monthTotal: 0, unpaidEntries: [] };

    const startDate = startOfMonth(setMonth(setYear(new Date(), selectedYear), parseInt(selectedMonth)));
    const endDate = endOfMonth(startDate);
    
    const unpaidEntries = allEntries.filter(entry => {
      const entryDate = parseISO(entry.timestamp);
      return (
        entry.favoriteClientId === selectedClientId &&
        entryDate >= startDate &&
        entryDate <= endDate &&
        !entry.estaPago
      );
    });

    const monthTotal = unpaidEntries.reduce((sum, entry) => sum + entry.total, 0);

    return { monthTotal, unpaidEntries: unpaidEntries.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) };

  }, [selectedClientId, selectedMonth, selectedYear, allEntries]);
  
  const handleMarkAsPaid = async () => {
    if (!firestore || !selectedClientId || clientData.unpaidEntries.length === 0) {
      toast({ variant: 'destructive', title: 'Nenhum lançamento para pagar.' });
      return;
    }
    
    setIsProcessingPayment(true);
    try {
      const batch = writeBatch(firestore);
      clientData.unpaidEntries.forEach(entry => {
        const docRef = doc(firestore, 'favorite_client_entries', entry.id);
        batch.update(docRef, { estaPago: true });
      });
      await batch.commit();

      toast({ title: 'Sucesso!', description: `Lançamentos do mês para ${favoriteClients?.find(c=>c.id === selectedClientId)?.name} marcados como pagos.` });

    } catch (error) {
      console.error('Error marking entries as paid:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível marcar os lançamentos como pagos.' });
    } finally {
      setIsProcessingPayment(false);
    }
  }
  
  const isLoading = isLoadingFavorites || isLoadingEntries || isLoadingOrderItems;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fecho Mensal de Clientes Favoritos</CardTitle>
          <CardDescription>Selecione um cliente e um período para ver o resumo de consumo e liquidar o saldo.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="client-select">Cliente</Label>
                  <Select value={selectedClientId || ''} onValueChange={setSelectedClientId}>
                    <SelectTrigger id="client-select">
                      <SelectValue placeholder="Selecione um cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {favoriteClients?.map(client => (
                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="report-month">Mês</Label>
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
                <div className="space-y-1">
                  <Label htmlFor="report-year">Ano</Label>
                  <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
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

              {selectedClientId && (
                <div className="pt-6">
                  <Separator />
                  <div className="mt-6 space-y-4">
                     <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg">
                        <div>
                            <p className="text-sm text-muted-foreground">Saldo em aberto para o período:</p>
                            <p className="text-3xl font-bold text-destructive">{formatCurrency(clientData.monthTotal)}</p>
                        </div>
                         <Button onClick={handleMarkAsPaid} disabled={isProcessingPayment || clientData.monthTotal === 0}>
                            {isProcessingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                             Marcar Mês como Pago
                        </Button>
                     </div>
                     <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Lançamentos em Aberto</CardTitle>
                        </CardHeader>
                        <CardContent>
                           {clientData.unpaidEntries.length > 0 ? (
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Itens</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {clientData.unpaidEntries.map(entry => {
                                                const orderItem = orderItemsMap.get(entry.orderItemId);
                                                return (
                                                <TableRow key={entry.id}>
                                                    <TableCell>{format(parseISO(entry.timestamp), 'dd/MM/yyyy HH:mm')}</TableCell>
                                                    <TableCell>{orderItem ? renderItemName(orderItem) : "Detalhes não encontrados"}</TableCell>
                                                    <TableCell className="text-right font-mono font-semibold">{formatCurrency(entry.total)}</TableCell>
                                                </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                           ) : (
                                <div className="text-center text-muted-foreground p-8">
                                    <Info className="mx-auto h-8 w-8 mb-2" />
                                    Nenhum lançamento em aberto para este cliente neste período.
                                </div>
                           )}
                        </CardContent>
                     </Card>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
