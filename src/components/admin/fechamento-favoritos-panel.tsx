
'use client';

import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc, writeBatch } from 'firebase/firestore';
import type { FavoriteClient, FavoriteClientEntry } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, setYear, setMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, DollarSign } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

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
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));
    const [isPaying, setIsPaying] = useState<Record<string, boolean>>({});
    const yearOptions = useMemo(() => generateYearOptions(), []);

    const favoriteClientsQuery = useMemoFirebase(
        () => (firestore && user) ? query(collection(firestore, 'favorite_clients'), where("userId", "==", user.uid), orderBy('name', 'asc')) : null,
        [firestore, user]
    );

    const favoriteEntriesQuery = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        
        const referenceDate = setMonth(setYear(new Date(), selectedYear), parseInt(selectedMonth, 10));
        const startDate = startOfMonth(referenceDate).toISOString();
        const endDate = endOfMonth(referenceDate).toISOString();

        return query(
            collection(firestore, 'favorite_client_entries'),
            where("userId", "==", user.uid),
            where('timestamp', '>=', startDate),
            where('timestamp', '<=', endDate)
        );
    }, [firestore, user, selectedYear, selectedMonth]);

    const { data: favoriteClients, isLoading: isLoadingClients } = useCollection<FavoriteClient>(favoriteClientsQuery);
    const { data: entriesInPeriod, isLoading: isLoadingEntries } = useCollection<FavoriteClientEntry>(favoriteEntriesQuery);

    const clientMonthlyTotals = useMemo(() => {
        if (!entriesInPeriod || !favoriteClients) return [];
        
        const totalsMap = new Map<string, { total: number, unpaidEntries: FavoriteClientEntry[] }>();

        entriesInPeriod.forEach(entry => {
            if (entry.estaPago) return;

            const clientData = totalsMap.get(entry.favoriteClientId) || { total: 0, unpaidEntries: [] };
            clientData.total += entry.total;
            clientData.unpaidEntries.push(entry);
            totalsMap.set(entry.favoriteClientId, clientData);
        });
        
        return Array.from(totalsMap.entries())
            .map(([clientId, data]) => {
                const client = favoriteClients.find(c => c.id === clientId);
                return {
                    clientId,
                    clientName: client?.name || 'Cliente Desconhecido',
                    total: data.total,
                    unpaidEntries: data.unpaidEntries,
                };
            })
            .filter(item => item.total > 0)
            .sort((a,b) => b.total - a.total);

    }, [entriesInPeriod, favoriteClients]);

    const handlePayMonth = async (clientId: string) => {
        if (!firestore) return;

        const clientData = clientMonthlyTotals.find(c => c.clientId === clientId);
        if (!clientData || clientData.unpaidEntries.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum lançamento a pagar' });
            return;
        }

        setIsPaying(prev => ({ ...prev, [clientId]: true }));

        try {
            const batch = writeBatch(firestore);
            clientData.unpaidEntries.forEach(entry => {
                const docRef = doc(firestore, 'favorite_client_entries', entry.id);
                batch.update(docRef, { estaPago: true });
            });
            await batch.commit();

            toast({ title: 'Sucesso!', description: `Saldo de ${clientData.clientName} para ${monthOptions[parseInt(selectedMonth)].label} foi liquidado.` });

        } catch (error) {
            console.error("Erro ao liquidar saldo:", error);
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível liquidar o saldo.' });
        } finally {
            setIsPaying(prev => ({ ...prev, [clientId]: false }));
        }
    }

    const isLoading = isLoadingClients || isLoadingEntries;

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-end gap-4">
                <div className='w-48 space-y-1'>
                    <Label htmlFor="fav-client-month" className="text-xs text-muted-foreground">Mês</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger id="fav-client-month">
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
                    <Label htmlFor="fav-client-year" className="text-xs text-muted-foreground">Ano</Label>
                    <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
                        <SelectTrigger id="fav-client-year">
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

            {clientMonthlyTotals.length > 0 ? (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente Favorito</TableHead>
                                <TableHead className="text-right">Total em Aberto</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {clientMonthlyTotals.map(clientData => (
                                <TableRow key={clientData.clientId}>
                                    <TableCell className="font-medium">{clientData.clientName}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-destructive">{formatCurrency(clientData.total)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            size="sm"
                                            onClick={() => handlePayMonth(clientData.clientId)}
                                            disabled={isPaying[clientData.clientId]}
                                        >
                                            {isPaying[clientData.clientId] ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                                            ) : (
                                                <DollarSign className="mr-2 h-4 w-4" />
                                            )}
                                            Pagar Mês
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <Alert>
                    <AlertTitle>Nenhum Saldo Pendente</AlertTitle>
                    <AlertDescription>
                        Não foram encontrados saldos em aberto para clientes favoritos no período selecionado.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
