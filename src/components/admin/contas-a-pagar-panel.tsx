
'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, orderBy, doc, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, isPast, isToday, isWithinInterval, parseISO, startOfWeek, endOfWeek, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ContaAPagar, Fornecedor } from '@/types';
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (dateString: string) => {
    try {
        return format(parseISO(dateString + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR });
    } catch (e) {
        return dateString;
    }
}

const getStatus = (conta: ContaAPagar): { text: string; className: string; isUrgent?: boolean } => {    
    if (conta.estaPaga) {
        return { text: 'Paga', className: 'bg-green-600' };
    }
    const dueDate = parseISO(conta.dataVencimento + 'T00:00:00');
    if (isPast(dueDate) && !isToday(dueDate)) {
        return { text: 'Vencida', className: 'bg-destructive animate-pulse', isUrgent: true };
    }
    if (isToday(dueDate)) {
        return { text: 'Vence Hoje', className: 'bg-yellow-500 text-black', isUrgent: true };
    }
    return { text: 'Em Aberto', className: 'bg-muted-foreground/50' };
};


const ContasTable = ({ contas, fornecedorMap, onStatusChange, onDeleteRequest }: {
    contas: ContaAPagar[],
    fornecedorMap: Map<string, Fornecedor>,
    onStatusChange: (conta: ContaAPagar, isPaga: boolean) => void,
    onDeleteRequest: (conta: ContaAPagar) => void,
}) => {
    if (contas.length === 0) {
        return <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada para os filtros selecionados.</p>;
    }

    return (
        <div className="rounded-md border mt-4">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Fornecedor/Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {contas.map((conta) => {
                        const status = getStatus(conta);
                        const fornecedor = fornecedorMap.get(conta.fornecedorId || '');
                        return (
                            <TableRow key={conta.id} className={cn(status.isUrgent && 'bg-destructive/10')}>
                                <TableCell>
                                    <div className="font-medium" style={{ color: fornecedor?.color || 'inherit' }}>
                                        {fornecedor?.nome || 'N/A'}
                                    </div>
                                    <div className="text-sm text-muted-foreground">{conta.descricao}</div>
                                </TableCell>
                                <TableCell className={cn(status.isUrgent && 'font-semibold text-foreground')}>{formatDate(conta.dataVencimento)}</TableCell>
                                <TableCell>
                                    <Badge variant={conta.estaPaga ? 'default' : 'secondary'} className={cn('pointer-events-none', status.className)}>
                                        {status.text}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold">{formatCurrency(conta.valor)}</TableCell>
                                <TableCell className="text-right">
                                     <div className="flex items-center justify-end gap-1">
                                        <Switch
                                            checked={conta.estaPaga}
                                            onCheckedChange={(isPaga) => onStatusChange(conta, isPaga)}
                                            aria-label="Marcar como paga"
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => onDeleteRequest(conta)}>
                                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

type FilterType = 'all' | 'vencidas' | 'hoje' | 'semana' | 'mes';

export default function ContasAPagarPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [allContas, setAllContas] = useState<ContaAPagar[]>([]);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [contaToDelete, setContaToDelete] = useState<ContaAPagar | null>(null);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    const fetchData = useCallback(async () => {
        if (!firestore) return;
        setIsLoading(true);
        try {
            const contasQuery = query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc'));
            const contasSnapshot = await getDocs(contasQuery);
            setAllContas(contasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContaAPagar)));

            const fornecedoresQuery = query(collection(firestore, 'fornecedores'));
            const fornecedoresSnapshot = await getDocs(fornecedoresQuery);
            setFornecedores(fornecedoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Fornecedor)));
        } catch (error) {
            console.error("Error fetching data for ContasAPagarPanel:", error);
            toast({ variant: 'destructive', title: 'Erro ao buscar dados', description: 'Não foi possível carregar as contas e fornecedores.' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, toast]);
    
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const fornecedorMap = useMemo(() => {
        if (!fornecedores) return new Map<string, Fornecedor>();
        return new Map(fornecedores.map(f => [f.id, f]));
    }, [fornecedores]);

    
    const { contasAPagar, counts } = useMemo(() => {
        let aPagar: ContaAPagar[] = [];
        
        if (!allContas) return { contasAPagar: [], counts: { vencidas: 0, hoje: 0, semana: 0, mes: 0 } };

        allContas.forEach(conta => {
            if (!conta.estaPaga) {
                aPagar.push(conta);
            }
        });

        const today = new Date();
        today.setHours(0,0,0,0);
        const startOfCurrentWeek = startOfWeek(today, { locale: ptBR });
        const endOfCurrentWeek = endOfWeek(today, { locale: ptBR });
        const endOfCurrentMonth = endOfMonth(today);

        const countVencidas = aPagar.filter(c => isPast(parseISO(c.dataVencimento + 'T00:00:00')) && !isToday(parseISO(c.dataVencimento + 'T00:00:00'))).length;
        const countHoje = aPagar.filter(c => isToday(parseISO(c.dataVencimento + 'T00:00:00'))).length;
        const countSemana = aPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: today, end: endOfCurrentWeek })).length;
        const countMes = aPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: today, end: endOfCurrentMonth })).length;

        return { 
            contasAPagar: aPagar, 
            counts: { vencidas: countVencidas, hoje: countHoje, semana: countSemana, mes: countMes }
        };

    }, [allContas]);

    const filteredContasAPagar = useMemo(() => {
        if (activeFilter === 'all') return contasAPagar;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (activeFilter === 'vencidas') {
            return contasAPagar.filter(c => isPast(parseISO(c.dataVencimento + 'T00:00:00')) && !isToday(parseISO(c.dataVencimento + 'T00:00:00')));
        }
        if (activeFilter === 'hoje') {
            return contasAPagar.filter(c => isToday(parseISO(c.dataVencimento + 'T00:00:00')));
        }
        if (activeFilter === 'semana') {
            const startOfCurrentWeek = startOfWeek(today, { locale: ptBR });
            const endOfCurrentWeek = endOfWeek(today, { locale: ptBR });
            return contasAPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startOfCurrentWeek, end: endOfCurrentWeek }));
        }
        if (activeFilter === 'mes') {
            const endOfCurrentMonth = endOfMonth(today);
            return contasAPagar.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: today, end: endOfCurrentMonth }));
        }
        return [];

    }, [contasAPagar, activeFilter]);


    const handleStatusChange = (conta: ContaAPagar, isPaga: boolean) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'contas_a_pagar', conta.id);
        updateDocumentNonBlocking(docRef, { estaPaga: isPaga });
        toast({
            title: `Conta ${isPaga ? 'marcada como paga' : 'marcada como em aberto'}.`,
            description: conta.descricao,
        });
    };

    const handleDeleteRequest = (conta: ContaAPagar) => {
        setContaToDelete(conta);
    };

    const confirmDelete = () => {
        if (!firestore || !contaToDelete) return;
        deleteDocumentNonBlocking(doc(firestore, "contas_a_pagar", contaToDelete.id));
        toast({
            title: "Sucesso",
            description: "Conta a pagar removida.",
        });
        setContaToDelete(null);
    };
    
    const handleRefresh = () => {
        toast({ title: "A atualizar dados...", duration: 2000 });
        fetchData();
    };

    const FilterButton = ({ filter, label, count }: { filter: FilterType, label: string, count: number }) => (
        <Button
            variant={activeFilter === filter ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(filter)}
            className="flex items-center gap-2"
        >
            {label}
            {count > 0 && <Badge variant={activeFilter === filter ? 'secondary' : 'default'} className="bg-red-500">{count}</Badge>}
        </Button>
    )

    return (
        <div className="space-y-6">
            <AlertDialog open={!!contaToDelete} onOpenChange={(open) => !open && setContaToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                        Essa ação não pode ser desfeita. Isso excluirá permanentemente a conta a pagar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <FilterButton filter="all" label="Todas" count={0} />
                    <FilterButton filter="vencidas" label="Vencidas" count={counts.vencidas} />
                    <FilterButton filter="hoje" label="Vence Hoje" count={counts.hoje} />
                    <FilterButton filter="semana" label="Esta Semana" count={counts.semana} />
                    <FilterButton filter="mes" label="Este Mês" count={counts.mes} />
                    <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading} className="ml-auto">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
                {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                ) : (
                    <ContasTable contas={filteredContasAPagar} fornecedorMap={fornecedorMap} onStatusChange={handleStatusChange} onDeleteRequest={handleDeleteRequest} />
                )}
            </div>
        </div>
    );
}

