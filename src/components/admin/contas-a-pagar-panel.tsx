
'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, doc, updateDoc, deleteDoc, where, getDocs, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, isPast, isToday, isWithinInterval, parseISO, startOfWeek, endOfWeek, endOfMonth, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ContaAPagar, Fornecedor, EntradaMercadoria, BomboniereItem } from '@/types';

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
import { Loader2, Trash2, FileText, Save } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';


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

const findBestBomboniereMatch = (productName: string, bomboniereItems: BomboniereItem[]): BomboniereItem | undefined => {
    if (!productName || !bomboniereItems) return undefined;

    const lowerProductName = productName.toLowerCase();
    let bestMatch: BomboniereItem | undefined = undefined;
    let longestMatchLength = 0;

    for (const bomboniereItem of bomboniereItems) {
        const baseBomboniereName = bomboniereItem.name.toLowerCase().replace(/\s*\(.*\)\s*/, '').trim();

        if (!baseBomboniereName) continue;
        
        if (lowerProductName.startsWith(baseBomboniereName)) {
            if (baseBomboniereName.length > longestMatchLength) {
                bestMatch = bomboniereItem;
                longestMatchLength = baseBomboniereName.length;
            }
        }
    }

    return bestMatch;
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
                                                        <p>Ver/editar itens do romaneio</p>
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

    const [editedRomaneioItems, setEditedRomaneioItems] = useState<EntradaMercadoria[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);

    const contasQuery = useMemo(() => firestore ? query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc')) : null, [firestore]);
    const fornecedoresQuery = useMemo(() => firestore ? query(collection(firestore, 'fornecedores')) : null, [firestore]);
    const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);

    const { data: allContas, isLoading: isLoadingContas } = useCollection<ContaAPagar>(contasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsQuery);

    const isLoading = isLoadingContas || isLoadingFornecedores || isLoadingBomboniere;

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
        setEditedRomaneioItems([]);

        try {
            const q = query(collection(firestore, 'entradas_mercadorias'), where('romaneioId', '==', conta.romaneioId));
            const querySnapshot = await getDocs(q);
            const items = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as EntradaMercadoria));
            setSelectedRomaneio({ conta, items });
            setEditedRomaneioItems(JSON.parse(JSON.stringify(items))); // Deep copy for editing
        } catch (error) {
            console.error("Error fetching romaneio items: ", error);
            toast({ variant: 'destructive', title: "Erro", description: "Não foi possível carregar os itens do romaneio." });
            setIsRomaneioModalOpen(false);
        } finally {
            setIsLoadingRomaneio(false);
        }
    };
    
    const handleItemChange = (itemId: string, field: keyof EntradaMercadoria, value: string) => {
        setEditedRomaneioItems(prev => {
            return prev.map(item => {
                if (item.id === itemId) {
                    const newItem = { ...item, [field]: value };
                    if (field === 'quantidade' || field === 'precoUnitario') {
                        const qty = parseFloat(String(newItem.quantidade || '0').replace(',', '.'));
                        const price = parseFloat(String(newItem.precoUnitario || '0').replace(',', '.'));
                        if (!isNaN(qty) && !isNaN(price)) {
                            newItem.valorTotal = qty * price;
                        }
                    }
                    return newItem;
                }
                return item;
            });
        });
    };
    
    const confirmSaveRomaneio = async () => {
        if (!firestore || !editedRomaneioItems || !selectedRomaneio || !bomboniereItems) return;

        setIsSaving(true);
        setIsEditConfirmOpen(false);
        
        try {
            const batch = writeBatch(firestore);

            for (const editedItem of editedRomaneioItems) {
                const originalItem = selectedRomaneio.items.find(i => i.id === editedItem.id);
                if (!originalItem) continue;

                const hasChanged = originalItem.produtoNome !== editedItem.produtoNome ||
                                 Number(originalItem.quantidade) !== Number(editedItem.quantidade) ||
                                 Number(originalItem.precoUnitario) !== Number(editedItem.precoUnitario);

                if (hasChanged) {
                    const entradaDocRef = doc(firestore, 'entradas_mercadorias', editedItem.id);

                    const newEntrada: Partial<EntradaMercadoria> = {
                        produtoNome: editedItem.produtoNome,
                        quantidade: Number(String(editedItem.quantidade).replace(',', '.')) || 0,
                        precoUnitario: Number(String(editedItem.precoUnitario).replace(',', '.')) || 0,
                    };
                    newEntrada.valorTotal = newEntrada.quantidade! * newEntrada.precoUnitario!;
                    
                    const oldMatched = findBestBomboniereMatch(originalItem.produtoNome, bomboniereItems);
                    const newMatched = findBestBomboniereMatch(newEntrada.produtoNome!, bomboniereItems);

                    if (oldMatched && oldMatched.id !== newMatched?.id) {
                        const bomboniereDocRef = doc(firestore, 'bomboniere_items', oldMatched.id);
                        const currentStock = bomboniereItems.find(bi => bi.id === oldMatched.id)?.estoque ?? 0;
                        batch.update(bomboniereDocRef, { estoque: currentStock - originalItem.quantidade });
                    }
                    if (newMatched) {
                        const bomboniereDocRef = doc(firestore, 'bomboniere_items', newMatched.id);
                        const currentStock = bomboniereItems.find(bi => bi.id === newMatched.id)?.estoque ?? 0;
                        const quantityDiff = oldMatched?.id === newMatched.id ? (newEntrada.quantidade! - originalItem.quantidade) : newEntrada.quantidade!;
                        batch.update(bomboniereDocRef, { estoque: currentStock + quantityDiff });
                    }

                    batch.update(entradaDocRef, newEntrada);
                }
            }

            await batch.commit();
            toast({ title: 'Sucesso', description: 'Romaneio atualizado com sucesso.' });
        } catch (error: any) {
            console.error("Error saving romaneio", error);
            toast({ variant: 'destructive', title: 'Erro', description: error.message });
        } finally {
            setIsSaving(false);
            setIsRomaneioModalOpen(false);
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

    const totalRomaneioEditado = useMemo(() => {
        if (!editedRomaneioItems) return 0;
        return editedRomaneioItems.reduce((acc, i) => acc + i.valorTotal, 0);
    }, [editedRomaneioItems]);
    
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
            
            <AlertDialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Alterações?</AlertDialogTitle>
                        <AlertDialogDescription>
                           A alteração deste romaneio <span className="font-bold">NÃO</span> irá atualizar o valor da Conta a Pagar associada.
                           Esta ação serve apenas para correção de dados. Deseja continuar?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmSaveRomaneio}>Sim, Continuar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <Dialog open={isRomaneioModalOpen} onOpenChange={setIsRomaneioModalOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Itens do Romaneio</DialogTitle>
                        <DialogDescription>
                            {selectedRomaneio?.conta.descricao}. Faça as edições necessárias abaixo.
                        </DialogDescription>
                    </DialogHeader>
                    {isLoadingRomaneio ? (
                        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                    ) : editedRomaneioItems && editedRomaneioItems.length > 0 ? (
                        <ScrollArea className="rounded-md border my-4 max-h-96">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-2/5">Produto</TableHead>
                                        <TableHead>Qtd.</TableHead>
                                        <TableHead className="text-right">Preço Unit.</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {editedRomaneioItems.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                <Input value={item.produtoNome} onChange={(e) => handleItemChange(item.id, 'produtoNome', e.target.value)} className="h-8"/>
                                            </TableCell>
                                            <TableCell>
                                                <Input value={String(item.quantidade).replace('.', ',')} onChange={(e) => handleItemChange(item.id, 'quantidade', e.target.value)} className="h-8"/>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                <Input value={String(item.precoUnitario).replace('.', ',')} onChange={(e) => handleItemChange(item.id, 'precoUnitario', e.target.value)} className="h-8 text-right"/>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.valorTotal)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={3} className="font-semibold">Valor Total da Nota</TableCell>
                                        <TableCell className="text-right font-bold text-lg text-primary">{formatCurrency(totalRomaneioEditado)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </ScrollArea>
                    ) : (
                        <p className="p-8 text-center text-sm text-muted-foreground">Nenhum item encontrado para este romaneio.</p>
                    )}
                    <DialogFooter>
                      <DialogClose asChild>
                          <Button variant="outline">Cancelar</Button>
                      </DialogClose>
                      <Button onClick={() => setIsEditConfirmOpen(true)} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                        Salvar Alterações
                      </Button>
                    </DialogFooter>
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

    