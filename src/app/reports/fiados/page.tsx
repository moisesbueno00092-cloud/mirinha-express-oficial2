
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query, where, orderBy, getDocs, collection } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import usePersistentState from '@/hooks/use-persistent-state';
import type { Item, SavedFavorite } from '@/types';
import { renderItemName } from '@/components/item-list';
import { MonthYearPicker } from '@/components/ui/month-year-picker';


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
      return format(date, "dd/MM/yy HH:mm");
    } catch (e) {
      return '-';
    }
};

export default function FiadosReportPage() {
  const firestore = useFirestore();
  const [savedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  
  const [isLoading, setIsLoading] = useState(false);
  const [customerItems, setCustomerItems] = useState<Item[]>([]);
  
  useEffect(() => {
    if (savedFavorites.length > 0 && !selectedCustomer) {
      setSelectedCustomer(savedFavorites[0].name);
    }
  }, [savedFavorites, selectedCustomer]);

  useEffect(() => {
    const fetchCustomerData = async () => {
      if (!firestore || !selectedCustomer || !selectedMonth) {
        setCustomerItems([]);
        return;
      }
      
      setIsLoading(true);
      
      const startDate = startOfMonth(selectedMonth);
      const endDate = endOfMonth(selectedMonth);

      try {
        const orderItemsQuery = query(
          collectionGroup(firestore, 'order_items'),
          where('customerName', '==', selectedCustomer),
          where('timestamp', '>=', startDate),
          where('timestamp', '<=', endDate),
          orderBy('timestamp', 'desc')
        );

        const liveItemsQuery = query(
          collectionGroup(firestore, 'live_items'),
          where('customerName', '==', selectedCustomer),
          where('timestamp', '>=', startDate),
          where('timestamp', '<=', endDate),
          orderBy('timestamp', 'desc')
        );
        
        const [orderItemsSnapshot, liveItemsSnapshot] = await Promise.all([
            getDocs(orderItemsQuery),
            getDocs(liveItemsQuery),
        ]);
        
        const itemsMap = new Map<string, Item>();

        orderItemsSnapshot.forEach(doc => {
            itemsMap.set(doc.id, { ...doc.data(), id: doc.id } as Item);
        });
        liveItemsSnapshot.forEach(doc => {
            itemsMap.set(doc.id, { ...doc.data(), id: doc.id } as Item);
        });
        
        const combinedItems = Array.from(itemsMap.values())
            .sort((a, b) => {
                const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp as any).getTime();
                const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp as any).getTime();
                return dateB - dateA;
            });

        setCustomerItems(combinedItems);

      } catch (error) {
        console.error("Error fetching customer data:", error);
        setCustomerItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomerData();
  }, [firestore, selectedCustomer, selectedMonth]);

  const totalFiado = useMemo(() => {
    return customerItems.reduce((acc, item) => acc + item.total, 0);
  }, [customerItems]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Relatório de Fiados por Cliente</CardTitle>
          <CardDescription>
            Selecione um cliente e um mês para ver o histórico de compras fiado.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1 w-full sm:w-auto">
                <Label htmlFor="customer-select" className="text-xs text-muted-foreground">Cliente</Label>
                <Select value={selectedCustomer || ''} onValueChange={setSelectedCustomer}>
                    <SelectTrigger id="customer-select">
                        <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                        {savedFavorites.length > 0 ? (
                            savedFavorites.map(fav => (
                                <SelectItem key={fav.id} value={fav.name}>{fav.name}</SelectItem>
                            ))
                        ) : (
                            <SelectItem value="no-fav" disabled>Nenhum favorito cadastrado</SelectItem>
                        )}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex-1 w-full sm:w-auto">
                 <Label htmlFor="month-select" className="text-xs text-muted-foreground">Mês e Ano</Label>
                 <MonthYearPicker date={selectedMonth} setDate={(d) => d && setSelectedMonth(d)} />
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Histórico de Compras</CardTitle>
              <CardDescription>
                  {selectedCustomer || 'Nenhum cliente selecionado'} - {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
              </CardDescription>
            </div>
            <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Fiado no Mês</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalFiado)}</p>
            </div>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : customerItems.length > 0 ? (
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
                            {customerItems.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="w-32">{formatTimestamp(item.timestamp)}</TableCell>
                                    <TableCell>{renderItemName(item)}</TableCell>
                                    <TableCell className="text-right font-semibold font-mono">{formatCurrency(item.total)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="text-center text-muted-foreground py-10">
                    <Info className="mx-auto h-8 w-8 mb-2" />
                    <p>Nenhuma compra fiado encontrada para este cliente neste período.</p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
