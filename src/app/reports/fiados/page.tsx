
'use client';

import { useState, useMemo, useEffect } from 'react';
import usePersistentState from '@/hooks/use-persistent-state';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
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
import { Label } from '@/components/ui/label';
import { Loader2, Info } from 'lucide-react';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { renderItemName } from '@/components/item-list';
import type { SavedFavorite, Item as OrderItem } from '@/types';


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
    return format(date, "dd/MM/yy 'às' HH:mm");
  } catch (e) {
    return '-';
  }
};


export default function FiadosReportPage() {
    const firestore = useFirestore();
    const [savedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);
    const [selectedFavorite, setSelectedFavorite] = useState<string | undefined>(undefined);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [items, setItems] = useState<OrderItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!selectedFavorite || !firestore) {
            setItems([]);
            return;
        }

        const fetchItems = async () => {
            setIsLoading(true);
            try {
                const startDate = startOfMonth(selectedDate);
                const endDate = endOfMonth(selectedDate);

                const q = query(
                    collection(firestore, 'order_items'),
                    where('customerName', '==', selectedFavorite),
                    where('timestamp', '>=', startDate),
                    where('timestamp', '<=', endDate),
                    orderBy('timestamp', 'desc')
                );

                const querySnapshot = await getDocs(q);
                const fetchedItems: OrderItem[] = [];
                querySnapshot.forEach((doc) => {
                    fetchedItems.push({ id: doc.id, ...doc.data() } as OrderItem);
                });
                setItems(fetchedItems);
            } catch (error) {
                console.error("Error fetching fiado items: ", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [selectedFavorite, selectedDate, firestore]);

    const totalFiado = useMemo(() => {
        return items.reduce((acc, item) => acc + item.total, 0);
    }, [items]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Relatório Mensal de Fiados</CardTitle>
                    <CardDescription>Consulte o histórico de compras de um cliente num determinado mês.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="favorite-select">Cliente</Label>
                        <Select value={selectedFavorite} onValueChange={setSelectedFavorite}>
                            <SelectTrigger id="favorite-select">
                                <SelectValue placeholder="Selecione um cliente" />
                            </SelectTrigger>
                            <SelectContent>
                                {savedFavorites.sort((a,b) => a.name.localeCompare(b.name)).map(fav => (
                                    <SelectItem key={fav.id} value={fav.name}>{fav.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="month-year-picker">Mês e Ano</Label>
                        <MonthYearPicker date={selectedDate} setDate={(d) => d && setSelectedDate(d)} />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Lançamentos</CardTitle>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Total no Mês</p>
                        <p className="text-2xl font-bold text-destructive">{formatCurrency(totalFiado)}</p>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center items-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : items.length > 0 ? (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Itens</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(item.timestamp)}</TableCell>
                                            <TableCell>{renderItemName(item)}</TableCell>
                                            <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.total)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-10">
                            <Info className="mx-auto h-8 w-8 mb-2"/>
                            <p>
                                {selectedFavorite ? "Nenhum lançamento encontrado para este cliente no período selecionado." : "Selecione um cliente para ver os seus lançamentos."}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
