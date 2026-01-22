'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import { startOfDay, endOfDay } from 'date-fns';
import type { Item, EntradaMercadoria } from '@/types';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export default function FechamentoCaixaPanel() {
    const firestore = useFirestore();

    // State for user inputs
    const [trocoInicial, setTrocoInicial] = useState('170,00');
    const [despesasExtras, setDespesasExtras] = useState('0,00');
    const [valorCartao, setValorCartao] = useState('0,00');
    const [valorPix, setValorPix] = useState('0,00');
    const [valorContado, setValorContado] = useState('0,00');

    // Data fetching
    const liveItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'live_items')) : null, [firestore]);
    const { data: liveItems, isLoading: isLoadingLiveItems } = useCollection<Item>(liveItemsQuery);

    const todayStart = useMemo(() => startOfDay(new Date()), []);
    const todayEnd = useMemo(() => endOfDay(new Date()), []);
    
    const despesasQuery = useMemo(() => firestore 
        ? query(collection(firestore, 'entradas_mercadorias'),
            where('estaPaga', '==', true),
            where('data', '>=', todayStart.toISOString()),
            where('data', '<=', todayEnd.toISOString())
          )
        : null, [firestore, todayStart, todayEnd]);
        
    const { data: despesasHoje, isLoading: isLoadingDespesas } = useCollection<EntradaMercadoria>(despesasQuery);

    // Calculations
    const { vendasAVista, totalTaxas } = useMemo(() => {
        if (!liveItems) return { vendasAVista: 0, totalTaxas: 0 };
        return liveItems.reduce((acc, item) => {
            if (item.group === 'Vendas salão' || item.group === 'Vendas rua') {
                acc.vendasAVista += item.total;
            }
            acc.totalTaxas += item.deliveryFee;
            return acc;
        }, { vendasAVista: 0, totalTaxas: 0 });
    }, [liveItems]);

    const totalDespesasHoje = useMemo(() => {
        if (!despesasHoje) return 0;
        return despesasHoje.reduce((acc, despesa) => acc + despesa.valorTotal, 0);
    }, [despesasHoje]);

    const parseCurrency = (value: string) => parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;

    const valorEsperado = useMemo(() => {
        const troco = parseCurrency(trocoInicial);
        const extras = parseCurrency(despesasExtras);
        return (vendasAVista + troco) - (totalTaxas + totalDespesasHoje + extras);
    }, [vendasAVista, trocoInicial, totalTaxas, totalDespesasHoje, despesasExtras]);
    
    const diferencaCaixa = useMemo(() => {
        const contado = parseCurrency(valorContado);
        return contado - valorEsperado;
    }, [valorContado, valorEsperado]);

    const isLoading = isLoadingLiveItems || isLoadingDespesas;

    const handleCurrencyChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/[^0-9,]/g, '');
        setter(value);
    }
    
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Fechamento de Caixa do Dia</CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Fechamento de Caixa do Dia</CardTitle>
                <CardDescription>Use esta ferramenta para fazer a prova real do seu caixa em dinheiro.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Calculation Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-4 rounded-lg bg-muted/30">
                    {/* Coluna Esquerda: Entradas */}
                    <div className="space-y-3">
                        <h4 className="font-semibold text-green-500">ENTRADAS (+)</h4>
                        <div className="flex justify-between items-center text-sm">
                            <Label>Vendas à Vista do Dia</Label>
                            <span className="font-mono font-semibold">{formatCurrency(vendasAVista)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <Label htmlFor="trocoInicial">Troco Inicial</Label>
                            <Input
                                id="trocoInicial"
                                value={trocoInicial}
                                onChange={handleCurrencyChange(setTrocoInicial)}
                                className="h-8 w-28 text-right font-mono"
                            />
                        </div>
                    </div>
                    {/* Coluna Direita: Saídas */}
                    <div className="space-y-3">
                        <h4 className="font-semibold text-destructive">SAÍDAS (-)</h4>
                         <div className="flex justify-between items-center text-sm">
                            <Label>Total Taxas de Entrega</Label>
                            <span className="font-mono font-semibold">{formatCurrency(totalTaxas)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <Label>Despesas à Vista do Dia</Label>
                            <span className="font-mono font-semibold">{formatCurrency(totalDespesasHoje)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <Label htmlFor="despesasExtras">Despesas Extras</Label>
                            <Input
                                id="despesasExtras"
                                value={despesasExtras}
                                onChange={handleCurrencyChange(setDespesasExtras)}
                                className="h-8 w-28 text-right font-mono"
                            />
                        </div>
                    </div>
                </div>

                 {/* Reference Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="valorCartao" className="text-muted-foreground">Entradas em Cartão</Label>
                        <Input
                            id="valorCartao"
                            value={valorCartao}
                            onChange={handleCurrencyChange(setValorCartao)}
                            className="h-9 w-full text-right font-mono"
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="valorPix" className="text-muted-foreground">Entradas em PIX</Label>
                        <Input
                            id="valorPix"
                            value={valorPix}
                            onChange={handleCurrencyChange(setValorPix)}
                            className="h-9 w-full text-right font-mono"
                        />
                    </div>
                </div>
                
                <Separator />

                {/* Final Proof Section */}
                <div className="space-y-4">
                    <div className="p-4 rounded-lg border bg-background text-center">
                        <Label className="text-sm text-muted-foreground">Valor Esperado em Caixa</Label>
                        <p className="text-3xl font-bold text-primary tracking-tight">{formatCurrency(valorEsperado)}</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="valorContado">Valor Contado em Caixa (R$)</Label>
                        <Input
                            id="valorContado"
                            value={valorContado}
                            onChange={handleCurrencyChange(setValorContado)}
                            className="h-12 text-2xl text-center font-mono"
                            placeholder="0,00"
                        />
                    </div>
                    <div className={cn("p-4 rounded-lg border text-center",
                        diferencaCaixa === 0 ? "bg-green-500/10 border-green-500/30" : "bg-destructive/10 border-destructive/30"
                    )}>
                        <Label className="text-sm">DIFERENÇA</Label>
                        <p className={cn("text-3xl font-bold tracking-tight",
                            diferencaCaixa === 0 ? "text-green-500" : "text-destructive"
                        )}>
                            {formatCurrency(diferencaCaixa)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {diferencaCaixa > 0 && "Valor a mais no caixa."}
                            {diferencaCaixa < 0 && "Valor a menos no caixa."}
                            {diferencaCaixa === 0 && "Caixa correto!"}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
