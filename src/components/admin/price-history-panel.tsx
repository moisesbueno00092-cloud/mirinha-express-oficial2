
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { EntradaMercadoria, Fornecedor, PriceHistoryEntry } from '@/types';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (dateString: string) => {
    try {
        return format(new Date(dateString), "dd/MM/yy", { locale: ptBR });
    } catch (e) {
        return dateString;
    }
}

export default function PriceHistoryPanel() {
    const firestore = useFirestore();
    const [searchTerm, setSearchTerm] = useState('');
    const [submittedSearch, setSubmittedSearch] = useState('');

    const entradasQuery = useMemoFirebase(
        () => (firestore && submittedSearch) 
            ? query(
                collection(firestore, 'entradas_mercadorias'), 
                where('produtoNome', '==', submittedSearch),
                orderBy('data', 'asc')
              ) 
            : null,
        [firestore, submittedSearch]
    );

    const fornecedoresQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'fornecedores')) : null,
        [firestore]
    );

    const { data: entradas, isLoading: isLoadingEntradas } = useCollection<EntradaMercadoria>(entradasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);

    const fornecedorMap = useMemo(() => {
        if (!fornecedores) return new Map<string, string>();
        return new Map(fornecedores.map(f => [f.id, f.nome]));
    }, [fornecedores]);

    const priceHistory: PriceHistoryEntry[] = useMemo(() => {
        if (!entradas) return [];
        return entradas.map(e => ({
            ...e,
            fornecedorNome: fornecedorMap.get(e.fornecedorId) || 'Desconhecido'
        })).sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    }, [entradas, fornecedorMap]);

    const chartData = useMemo(() => {
        return priceHistory.map(entry => ({
            date: formatDate(entry.data),
            price: entry.precoUnitario,
            supplier: entry.fornecedorNome,
        }));
    }, [priceHistory]);


    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;
        setSubmittedSearch(searchTerm.trim());
    }
    
    const isLoading = isLoadingEntradas || isLoadingFornecedores;

    return (
        <div className="space-y-6">
            <form onSubmit={handleSearch} className="flex gap-2">
                <Input 
                    placeholder="Digite o nome exato do produto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10"
                />
                <Button type="submit" disabled={isLoading || !searchTerm.trim()}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}
                    <span className="ml-2 hidden sm:inline">Buscar</span>
                </Button>
            </form>

            {isLoading && (
                <div className="flex justify-center items-center p-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}
            
            {!isLoading && submittedSearch && priceHistory.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    Nenhum histórico de preço encontrado para "{submittedSearch}".
                </div>
            )}

            {priceHistory.length > 0 && (
                <div className="space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>Variação de Preço de "{submittedSearch}"</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={{}} className="h-64 w-full">
                                <AreaChart data={chartData} margin={{ left: -20, right: 20 }}>
                                     <defs>
                                        <linearGradient id="fillPrice" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis 
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tickFormatter={(value) => formatCurrency(value as number)}
                                        width={100}
                                    />
                                    <ChartTooltip
                                        cursor={true}
                                        content={<ChartTooltipContent
                                            formatter={(value, name, props) => (
                                                <div>
                                                  <p className="font-bold">{formatCurrency(value as number)}</p>
                                                  <p className="text-xs text-muted-foreground">
                                                    Fornecedor: {props.payload.supplier}
                                                  </p>
                                                </div>
                                            )}
                                            labelFormatter={(label) => `Data: ${label}`}
                                            indicator="dot"
                                        />}
                                    />
                                    <Area
                                        dataKey="price"
                                        type="monotone"
                                        fill="url(#fillPrice)"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        </CardContent>
                     </Card>

                    <Card>
                        <CardHeader>
                           <CardTitle>Histórico de Compras</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Fornecedor</TableHead>
                                        <TableHead className="text-right">Preço Unitário</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {priceHistory.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{formatDate(entry.data)}</TableCell>
                                            <TableCell className="font-medium">{entry.fornecedorNome}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(entry.precoUnitario)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
