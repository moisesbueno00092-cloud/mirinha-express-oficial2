'use client';

import { useMemo, useState } from 'react';
import type { Funcionario, FuncionarioLancamentoFinanceiro, FuncionarioHolerite } from '@/types';
import { startOfMonth, endOfMonth, setYear, setMonth, isWithinInterval, parseISO } from 'date-fns';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Loader2, FileText, Download } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';

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

const tipoLancamentoStyle: Record<FuncionarioLancamentoFinanceiro['tipo'], {label: string, className: string}> = {
    'vale': { label: 'Vale', className: 'bg-yellow-500 text-black' },
    'bonus': { label: 'Bônus', className: 'bg-green-500' },
    'desconto': { label: 'Desconto', className: 'bg-red-500' },
    'hora_extra': { label: 'Hora Extra', className: 'bg-blue-500' },
    'comissao': { label: 'Comissão', className: 'bg-purple-500' },
    'falta': { label: 'Falta', className: 'bg-gray-600' },
}

interface FechamentoFolhaPanelProps {
    funcionario: Funcionario;
}

export default function FechamentoFolhaPanel({ funcionario }: FechamentoFolhaPanelProps) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const yearOptions = useMemo(() => generateYearOptions(), []);

    const { start, end } = useMemo(() => {
        const referenceDate = setMonth(setYear(new Date(), selectedYear), parseInt(selectedMonth, 10));
        const start = startOfMonth(referenceDate);
        const end = endOfMonth(referenceDate);
        return { start, end };
    }, [selectedYear, selectedMonth]);

    const lancamentosQuery = useMemoFirebase(
        () => firestore && funcionario.id ? 
            query(
                collection(firestore, 'funcionarios', funcionario.id, 'lancamentos'), 
                orderBy('data', 'desc')
            ) 
            : null,
        [firestore, funcionario.id]
    );
    
    const holeritesQuery = useMemoFirebase(
        () => firestore && funcionario.id ?
            query(
                collection(firestore, 'funcionarios', funcionario.id, 'holerites'),
                where('ano', '==', selectedYear),
                where('mes', '==', parseInt(selectedMonth, 10))
            )
            : null,
        [firestore, funcionario.id, selectedYear, selectedMonth]
    );

    const { data: allLancamentos, isLoading: isLoadingLancamentos } = useCollection<FuncionarioLancamentoFinanceiro>(lancamentosQuery);
    const { data: holeritesDoMes, isLoading: isLoadingHolerites } = useCollection<FuncionarioHolerite>(holeritesQuery);

    const lancamentosDoPeriodo = useMemo(() => {
        if (!allLancamentos) return [];
        return allLancamentos.filter(lanc => {
            const dataLanc = parseISO(lanc.data);
            return isWithinInterval(dataLanc, { start, end });
        });
    }, [allLancamentos, start, end]);

    const holeriteCalculado = useMemo(() => {
        const salarioBase = funcionario.salarioBase;

        const vencimentos = lancamentosDoPeriodo
            .filter(l => ['bonus', 'hora_extra', 'comissao'].includes(l.tipo))
            .reduce((acc, l) => acc + l.valor, 0);

        const descontos = lancamentosDoPeriodo
            .filter(l => ['vale', 'desconto', 'falta'].includes(l.tipo))
            .reduce((acc, l) => acc + l.valor, 0);
        
        const totalVencimentos = salarioBase + vencimentos;
        const totalDescontos = descontos;
        const valorLiquido = totalVencimentos - totalDescontos;

        return {
            salarioBase,
            vencimentos,
            descontos,
            totalVencimentos,
            totalDescontos,
            valorLiquido,
        }
    }, [funcionario.salarioBase, lancamentosDoPeriodo]);
    
    const jaFechado = useMemo(() => holeritesDoMes && holeritesDoMes.length > 0, [holeritesDoMes]);

    const handleFecharMes = async () => {
        if (!firestore || !funcionario) return;
        if (jaFechado) {
            toast({ variant: 'destructive', title: 'Mês já fechado', description: 'Este mês já foi fechado e não pode ser alterado.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const novoHolerite: Omit<FuncionarioHolerite, 'id'> = {
                funcionarioId: funcionario.id,
                mes: parseInt(selectedMonth, 10),
                ano: selectedYear,
                dataFechamento: new Date().toISOString(),
                salarioBase: holeriteCalculado.salarioBase,
                totalVencimentos: holeriteCalculado.totalVencimentos,
                totalDescontos: holeriteCalculado.totalDescontos,
                valorLiquido: holeriteCalculado.valorLiquido,
                lancamentos: lancamentosDoPeriodo,
            };

            const holeritesCollectionRef = collection(firestore, 'funcionarios', funcionario.id, 'holerites');
            await addDocumentNonBlocking(holeritesCollectionRef, novoHolerite as any);

            toast({ title: 'Sucesso!', description: `Folha de ${monthOptions[parseInt(selectedMonth, 10)].label} fechada para ${funcionario.nome}.` });

        } catch (error) {
            console.error("Erro ao fechar folha:", error);
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível fechar a folha de pagamento.' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const isLoading = isLoadingLancamentos || isLoadingHolerites;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Fechamento de Folha de Pagamento</CardTitle>
                <CardDescription>Consolide e visualize o valor líquido a pagar para {funcionario.nome.split(' ')[0]}.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className='space-y-1'>
                        <Label htmlFor="holerite-mes" className="text-xs text-muted-foreground">Mês</Label>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger id="holerite-mes">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {monthOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='space-y-1'>
                        <Label htmlFor="holerite-ano" className="text-xs text-muted-foreground">Ano</Label>
                        <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
                            <SelectTrigger id="holerite-ano">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {yearOptions.map(year => (
                                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="md:text-right self-end">
                        {jaFechado && <Badge className="bg-green-600 text-white">Mês Fechado</Badge>}
                    </div>
                </div>

                {isLoading ? (
                     <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
                        <div className="space-y-4">
                            <h4 className="font-semibold text-center">Demonstrativo de Pagamento</h4>
                            <div className="rounded-lg border p-4 space-y-3">
                                {/* Vencimentos */}
                                <div className="space-y-1">
                                    <p className="font-medium text-green-500">Vencimentos</p>
                                    <div className="flex justify-between text-sm">
                                        <span>Salário Base</span>
                                        <span className="font-mono">{formatCurrency(holeriteCalculado.salarioBase)}</span>
                                    </div>
                                    {lancamentosDoPeriodo.filter(l => ['bonus', 'hora_extra', 'comissao'].includes(l.tipo)).map(lanc => (
                                        <div key={lanc.id} className="flex justify-between text-sm text-muted-foreground">
                                            <span>{tipoLancamentoStyle[lanc.tipo]?.label || lanc.tipo}</span>
                                            <span className="font-mono">{formatCurrency(lanc.valor)}</span>
                                        </div>
                                    ))}
                                </div>
                                <Separator />
                                <div className="flex justify-between font-semibold text-sm">
                                    <span>Total de Vencimentos</span>
                                    <span className="font-mono text-green-500">{formatCurrency(holeriteCalculado.totalVencimentos)}</span>
                                </div>
                            </div>
                            
                             <div className="rounded-lg border p-4 space-y-3">
                                {/* Descontos */}
                                <div className="space-y-1">
                                    <p className="font-medium text-red-500">Descontos</p>
                                     {lancamentosDoPeriodo.filter(l => ['vale', 'desconto', 'falta'].includes(l.tipo)).map(lanc => (
                                        <div key={lanc.id} className="flex justify-between text-sm text-muted-foreground">
                                            <span>{tipoLancamentoStyle[lanc.tipo]?.label || lanc.tipo}</span>
                                            <span className="font-mono">-{formatCurrency(lanc.valor)}</span>
                                        </div>
                                    ))}
                                    {lancamentosDoPeriodo.filter(l => ['vale', 'desconto', 'falta'].includes(l.tipo)).length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-2">Nenhum desconto no período.</p>
                                    )}
                                </div>
                                <Separator />
                                <div className="flex justify-between font-semibold text-sm">
                                    <span>Total de Descontos</span>
                                    <span className="font-mono text-red-500">{formatCurrency(holeriteCalculado.totalDescontos)}</span>
                                </div>
                            </div>

                            <Separator className="my-4"/>

                            <div className="flex justify-between items-center text-lg font-bold text-primary p-3 bg-muted/50 rounded-lg">
                                <span>Valor Líquido a Pagar</span>
                                <span className="font-mono">{formatCurrency(holeriteCalculado.valorLiquido)}</span>
                            </div>
                        </div>

                        <div className="border-l border-border pl-8">
                             <h4 className="font-semibold mb-2">Lançamentos do Mês</h4>
                             <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                                {lancamentosDoPeriodo.length > 0 ? lancamentosDoPeriodo.map(lanc => (
                                    <div key={lanc.id} className="text-xs p-2 rounded-md border bg-card">
                                        <div className="flex justify-between items-center">
                                            <Badge className={cn(tipoLancamentoStyle[lanc.tipo]?.className, 'text-white text-xs')}>{tipoLancamentoStyle[lanc.tipo]?.label || lanc.tipo}</Badge>
                                            <span className={cn('font-semibold font-mono', ['bonus', 'hora_extra', 'comissao'].includes(lanc.tipo) ? 'text-green-500' : 'text-red-500')}>
                                               {['bonus', 'hora_extra', 'comissao'].includes(lanc.tipo) ? '+' : '-'} {formatCurrency(lanc.valor)}
                                            </span>
                                        </div>
                                        {lanc.descricao && <p className="text-muted-foreground mt-1 text-[11px]">{lanc.descricao}</p>}
                                    </div>
                                )) : (
                                    <div className="text-center text-muted-foreground py-10">
                                        <FileText className="h-6 w-6 mx-auto mb-2" />
                                        <p>Nenhum lançamento registado para este mês.</p>
                                    </div>
                                )}
                             </div>
                        </div>
                    </div>
                )}
                 <div className="flex justify-end pt-6">
                    <Button onClick={handleFecharMes} disabled={isSubmitting || isLoading || jaFechado}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}
                        Fechar e Salvar Mês
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
