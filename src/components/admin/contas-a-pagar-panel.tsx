
'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, doc, updateDoc, deleteDoc, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, isPast, isToday, isWithinInterval, parseISO, startOfWeek, endOfWeek, endOfMonth, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ContaAPagar, Fornecedor, EntradaMercadoria } from '@/types';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, FileText } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

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

type FilterType = 'all' | 'vencidas' | 'hoje' | 'semana' | 'mes' | 'pagas';

const ContasTable = ({ contas, fornecedorMap, onStatusChange, onDeleteRequest, totalPeriodo, onViewRomaneio, activeFilter }: {
    contas: ContaAPagar[],
    fornecedorMap: Map<string, Fornecedor>,
    onStatusChange: (conta: ContaAPagar, isPaga: boolean) => void,
    onDeleteRequest: (conta: ContaAPagar) => void,
    totalPeriodo: number,
    onViewRomaneio: (conta: ContaAPagar) => void,
    activeFilter: FilterType
}) => {
    if (contas.length === 0) {
        return <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada para os filtros selecionados.</p>;
    }
    const isPagasView = activeFilter === 'pagas';

    return (
        <TooltipProvider>
            <div className="rounded-md border mt-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fornecedor/Descrição</TableHead>
                            <TableHead>Data</TableHead>
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
                                            {conta.romaneioId && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" onClick={() => onViewRomaneio(conta)}>
                                                            <FileText className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Ver itens do romaneio</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
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
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={3} className="font-semibold">{isPagasView ? 'Total Pago' : 'Total em Aberto no Período'}</TableCell>
                            <TableCell className={cn("text-right font-bold text-lg", isPagasView ? 'text-green-500' : 'text-destructive')} colSpan={2}>{formatCurrency(totalPeriodo)}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        </TooltipProvider>
    );
}

export default function ContasAPagarPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [contaToDelete, setContaToDelete] = useState<ContaAPagar | null>(null);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [isRomaneioModalOpen, setIsRomaneioModalOpen] = useState(false);
    const [selectedRomaneio, setSelectedRomaneio] = useState<{ conta: ContaAPagar, items: EntradaMercadoria[] } | null>(null);
    const [isLoadingRomaneio, setIsLoadingRomaneio] = useState(false);

    const contasQuery = useMemo(
        () => firestore ? query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc')) : null,
        [firestore]
    );
    const fornecedoresQuery = useMemo(
        () => firestore ? query(collection(firestore, 'fornecedores')) : null,
        [firestore]
    );

    const { data: allContas, isLoading: isLoadingContas } = useCollection<ContaAPagar>(contasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);

    const isLoading = isLoadingContas || isLoadingFornecedores;

    const fornecedorMap = useMemo(() => {
        if (!fornecedores) return new Map<string, Fornecedor>();
        return new Map(fornecedores.map(f => [f.id, f]));
    }, [fornecedores]);

    
    const { counts } = useMemo(() => {
        const contasEmAberto = allContas?.filter(c => !c.estaPaga) || [];
        
        const today = new Date();
        today.setHours(0,0,0,0);

        const countVencidas = contasEmAberto.filter(c => isPast(parseISO(c.dataVencimento + 'T00:00:00')) && !isToday(parseISO(c.dataVencimento + 'T00:00:00'))).length;
        const countHoje = contasEmAberto.filter(c => isToday(parseISO(c.dataVencimento + 'T00:00:00'))).length;
        const countSemana = contasEmAberto.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startOfWeek(new Date(), { locale: ptBR }), end: endOfWeek(new Date(), { locale: ptBR }) })).length;
        const countMes = contasEmAberto.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startOfMonth(today), end: endOfMonth(today) })).length;

        return { 
            counts: { vencidas: countVencidas, hoje: countHoje, semana: countSemana, mes: countMes },
        };
    }, [allContas]);

    const filteredContas = useMemo(() => {
        if (!allContas) return [];
        if (activeFilter === 'pagas') {
            return allContas.filter(c => c.estaPaga).sort((a,b) => parseISO(b.dataVencimento).getTime() - parseISO(a.dataVencimento).getTime());
        }
        
        const contasEmAberto = allContas.filter(c => !c.estaPaga); // Query is already sorted by date asc

        if (activeFilter === 'all') return contasEmAberto;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (activeFilter === 'vencidas') {
            return contasEmAberto.filter(c => isPast(parseISO(c.dataVencimento + 'T00:00:00')) && !isToday(parseISO(c.dataVencimento + 'T00:00:00')));
        }
        if (activeFilter === 'hoje') {
            return contasEmAberto.filter(c => isToday(parseISO(c.dataVencimento + 'T00:00:00')));
        }
        if (activeFilter === 'semana') {
            const startOfCurrentWeek = startOfWeek(today, { locale: ptBR });
            const endOfCurrentWeek = endOfWeek(today, { locale: ptBR });
            return contasEmAberto.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startOfCurrentWeek, end: endOfCurrentWeek }));
        }
        if (activeFilter === 'mes') {
            const startOfCurrentMonth = startOfMonth(today);
            const endOfCurrentMonth = endOfMonth(today);
            return contasEmAberto.filter(c => isWithinInterval(parseISO(c.dataVencimento + 'T00:00:00'), { start: startOfCurrentMonth, end: endOfCurrentMonth }));
        }
        return [];

    }, [allContas, activeFilter]);

    const totalPeriodo = useMemo(() => {
        return filteredContas.reduce((acc, conta) => acc + conta.valor, 0);
    }, [filteredContas]);

    const handleViewRomaneio = async (conta: ContaAPagar) => {
        if (!firestore || !conta.romaneioId) return;

        setIsLoadingRomaneio(true);
        setIsRomaneioModalOpen(true);
        setSelectedRomaneio(null);

        try {
            const q = query(collection(firestore, 'entradas_mercadorias'), where('romaneioId', '==', conta.romaneioId));
            const querySnapshot = await getDocs(q);
            const items = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as EntradaMercadoria));
            setSelectedRomaneio({ conta, items });
        } catch (error) {
            console.error("Error fetching romaneio items: ", error);
            toast({ variant: 'destructive', title: "Erro", description: "Não foi possível carregar os itens do romaneio." });
            setIsRomaneioModalOpen(false);
        } finally {
            setIsLoadingRomaneio(false);
        }
    };

    const handleStatusChange = async (conta: ContaAPagar, isPaga: boolean) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'contas_a_pagar', conta.id);
        await updateDoc(docRef, { estaPaga: isPaga });
        toast({
            title: `Conta ${isPaga ? 'marcada como paga' : 'marcada como em aberto'}.`,
            description: conta.descricao,
        });
    };

    const handleDeleteRequest = (conta: ContaAPagar) => {
        setContaToDelete(conta);
    };

    const confirmDelete = async () => {
        if (!firestore || !contaToDelete) return;
        await deleteDoc(doc(firestore, "contas_a_pagar", contaToDelete.id));
        toast({
            title: "Sucesso",
            description: "Conta a pagar removida.",
        });
        setContaToDelete(null);
    };
    
    const FilterButton = ({ filter, label, count }: { filter: FilterType, label: string, count: number }) => (
        <Button
            variant={activeFilter === filter ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(filter)}
            className="flex items-center gap-2"
        >
            {label}
            {count > 0 && <Badge variant={activeFilter === filter ? 'secondary' : 'destructive'} >{count}</Badge>}
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
            
            <Dialog open={isRomaneioModalOpen} onOpenChange={setIsRomaneioModalOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Itens do Romaneio</DialogTitle>
                        <DialogDescription>
                            {selectedRomaneio?.conta.descricao}
                        </DialogDescription>
                    </DialogHeader>
                    {isLoadingRomaneio ? (
                        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                    ) : selectedRomaneio && selectedRomaneio.items.length > 0 ? (
                        <div className="rounded-md border my-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Produto</TableHead>
                                        <TableHead>Qtd.</TableHead>
                                        <TableHead className="text-right">Preço Unit.</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedRomaneio.items.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.produtoNome}</TableCell>
                                            <TableCell>{item.quantidade}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(item.precoUnitario)}</TableCell>
                                            <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.valorTotal)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={3} className="font-semibold">Valor Total da Nota</TableCell>
                                        <TableCell className="text-right font-bold text-lg text-primary">{formatCurrency(selectedRomaneio.items.reduce((acc, i) => acc + i.valorTotal, 0))}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    ) : (
                        <p className="p-8 text-center text-sm text-muted-foreground">Nenhum item encontrado para este romaneio.</p>
                    )}
                </DialogContent>
            </Dialog>

            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <FilterButton filter="all" label="Todas em Aberto" count={0} />
                    <FilterButton filter="vencidas" label="Vencidas" count={counts.vencidas} />
                    <FilterButton filter="hoje" label="Vence Hoje" count={counts.hoje} />
                    <FilterButton filter="semana" label="Esta Semana" count={counts.semana} />
                    <FilterButton filter="mes" label="Este Mês" count={counts.mes} />
                    <FilterButton filter="pagas" label="Pagas" count={0} />
                </div>
                {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                ) : (
                    <ContasTable 
                        contas={filteredContas} 
                        fornecedorMap={fornecedorMap} 
                        onStatusChange={handleStatusChange} 
                        onDeleteRequest={handleDeleteRequest}
                        totalPeriodo={totalPeriodo}
                        onViewRomaneio={handleViewRomaneio}
                        activeFilter={activeFilter}
                    />
                )}
            </div>
        </div>
    );
}


    