
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query, where, orderBy } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, parseISO, set } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import usePersistentState from '@/hooks/use-persistent-state';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Info, Star } from 'lucide-react';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { renderItemName } from '@/components/item-list';
import type { Item, SavedFavorite } from '@/types';


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
};

export default function FavoritesReportPage() {
    const firestore = useFirestore();
    const [savedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);

    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    
    const customerName = useMemo(() => {
        if (!selectedCustomerId) return null;
        return savedFavorites.find(f => f.id === selectedCustomerId)?.name || null;
    }, [selectedCustomerId, savedFavorites]);

    const itemsQuery = useMemoFirebase(() => {
        if (!firestore || !customerName || !selectedDate) return null;

        const startDate = startOfMonth(selectedDate);
        const endDate = endOfMonth(selectedDate);

        return query(
            collectionGroup(firestore, 'order_items'),
            where('customerName', '==', customerName),
            where('timestamp', '>=', startDate),
            where('timestamp', '<=', endDate),
            orderBy('timestamp', 'desc')
        );
    }, [firestore, customerName, selectedDate]);
    
    const { data: items, isLoading } = useCollection<Item>(itemsQuery);

    const totalPeriodo = useMemo(() => {
        if (!items) return 0;
        return items.reduce((acc, item) => acc + item.total, 0);
    }, [items]);

    return (
        <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8">
            <header className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/reports" passHref>
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    </Link>
                    <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatório por Cliente</h1>
                    <p className="text-muted-foreground">Analise as compras mensais dos seus clientes favoritos.</p>
                    </div>
                </div>
            </header>

            <main className="space-y-6">
                <Card>
                    <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Cliente Favorito</label>
                            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um cliente" />
                                </SelectTrigger>
                                <SelectContent>
                                    {savedFavorites.map(fav => (
                                        <SelectItem key={fav.id} value={fav.id}>{fav.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Mês e Ano</label>
                            <MonthYearPicker date={selectedDate} setDate={setSelectedDate} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Compras de {customerName || 'Nenhum cliente selecionado'}</CardTitle>
                        <CardDescription>
                            {selectedDate ? `Período: ${format(selectedDate, 'MMMM yyyy', { locale: ptBR })}` : ''}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                             <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                        ) : !selectedCustomerId ? (
                            <div className="text-center text-muted-foreground p-8">
                                <Star className="mx-auto h-8 w-8 mb-2"/>
                                <p>Selecione um cliente para ver o seu histórico de compras.</p>
                            </div>
                        ) : items && items.length > 0 ? (
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Itens</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>{format(item.timestamp.toDate(), 'dd/MM/yyyy HH:mm')}</TableCell>
                                                <TableCell>{renderItemName(item)}</TableCell>
                                                <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.total)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <div className="flex justify-end items-center p-4 border-t">
                                    <span className="font-semibold text-lg">Total do Período:</span>
                                    <span className="font-mono font-bold text-lg text-primary ml-4">{formatCurrency(totalPeriodo)}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground p-8">
                                <Info className="mx-auto h-8 w-8 mb-2"/>
                                <p>Nenhuma compra encontrada para este cliente no período selecionado.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}

