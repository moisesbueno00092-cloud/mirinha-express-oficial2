
'use client';

import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
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
import { Loader2, Trash2 } from 'lucide-react';
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


export default function ContasAPagarPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [contaToDelete, setContaToDelete] = useState<ContaAPagar | null>(null);

    const contasQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc')) : null,
        [firestore]
    );

    const fornecedoresQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'fornecedores')) : null,
        [firestore]
    );

    const { data: contas, isLoading: isLoadingContas } = useCollection<ContaAPagar>(contasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);

    const fornecedorMap = useMemo(() => {
        if (!fornecedores) return new Map<string, string>();
        return new Map(fornecedores.map(f => [f.id, f.nome]));
    }, [fornecedores]);

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
    
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(value);
    };

    const formatDate = (dateString: string) => {
        try {
            // Add time to avoid timezone issues with format()
            return format(new Date(dateString + 'T00:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR });
        } catch (e) {
            return dateString;
        }
    }
    
    const isLoading = isLoadingContas || isLoadingFornecedores;

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
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fornecedor/Descrição</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : contas && contas.length > 0 ? (
                            contas.map((conta) => {
                                const isVencida = !conta.estaPaga && new Date(conta.dataVencimento) < new Date();
                                return (
                                    <TableRow key={conta.id} className={cn(isVencida && 'text-destructive')}>
                                        <TableCell>
                                            <div className="font-medium">{fornecedorMap.get(conta.fornecedorId || '') || 'N/A'}</div>
                                            <div className="text-sm text-muted-foreground">{conta.descricao}</div>
                                        </TableCell>
                                        <TableCell>{formatDate(conta.dataVencimento)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(conta.valor)}</TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex flex-col items-center gap-1.5">
                                                <Switch
                                                    checked={conta.estaPaga}
                                                    onCheckedChange={(isPaga) => handleStatusChange(conta, isPaga)}
                                                    aria-label="Marcar como paga"
                                                />
                                                <Badge variant={conta.estaPaga ? 'default' : 'secondary'} className={cn(conta.estaPaga ? 'bg-green-600' : isVencida ? 'bg-destructive/80' : '', "pointer-events-none")}>
                                                    {conta.estaPaga ? 'Paga' : (isVencida ? 'Vencida' : 'Em Aberto')}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteRequest(conta)}>
                                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    Nenhuma conta a pagar encontrada.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
