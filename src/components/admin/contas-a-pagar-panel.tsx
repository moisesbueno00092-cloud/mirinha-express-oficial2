
'use client';

import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, isPast, isSameMonth, isSameYear, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ContaAPagar, Fornecedor, EntradaMercadoria } from '@/types';
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
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Trash2, Search, History, TrendingUp, CalendarDays } from 'lucide-react';
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
import { Separator } from '../ui/separator';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (dateString: string, includeTime = false) => {
    try {
        const formatString = includeTime ? "dd/MM/yy 'às' HH:mm" : "dd 'de' MMM, yyyy";
        // Add time to avoid timezone issues with format() for date-only strings
        return format(new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00'), formatString, { locale: ptBR });
    } catch (e) {
        return dateString;
    }
}


export default function ContasAPagarPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [contaToDelete, setContaToDelete] = useState<ContaAPagar | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const contasQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'contas_a_pagar'), orderBy('dataVencimento', 'asc')) : null,
        [firestore]
    );

    const fornecedoresQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'fornecedores')) : null,
        [firestore]
    );

    const allEntradasQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'entradas_mercadorias'), orderBy('data', 'desc')) : null,
        [firestore]
    );

    const { data: contas, isLoading: isLoadingContas } = useCollection<ContaAPagar>(contasQuery);
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const { data: allEntradas, isLoading: isLoadingAllEntradas } = useCollection<EntradaMercadoria>(allEntradasQuery);


    const fornecedorMap = useMemo(() => {
        if (!fornecedores) return new Map<string, string>();
        return new Map(fornecedores.map(f => [f.id, f.nome]));
    }, [fornecedores]);

    const filteredEntradas = useMemo(() => {
        if (!allEntradas) return [];
        if (!searchQuery.trim()) return [];
        return allEntradas.filter(entrada => 
            entrada.produtoNome.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [allEntradas, searchQuery]);
    
    const expenseSummary = useMemo(() => {
        if (!contas) return { month: 0, year: 0 };
        const now = new Date();
        const startOfCurrentMonth = startOfMonth(now);

        let monthTotal = 0;
        let yearTotal = 0;

        contas.forEach(conta => {
            const dueDate = parseISO(conta.dataVencimento + 'T00:00:00');
            const isDue = isPast(dueDate);

            if (conta.estaPaga || isDue) {
                 if (isSameYear(dueDate, now)) {
                    yearTotal += conta.valor;
                }
                if (isSameMonth(dueDate, startOfCurrentMonth)) {
                    monthTotal += conta.valor;
                }
            }
        });
        
        return { month: monthTotal, year: yearTotal };

    }, [contas]);


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
    
    const isLoading = isLoadingContas || isLoadingFornecedores || isLoadingAllEntradas;

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
            
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground">Resumo de Despesas</CardTitle>
                </CardHeader>
                <CardContent>
                     {isLoadingContas ? (
                         <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                     ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
                            <div className="bg-muted/50 p-4 rounded-lg">
                                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                    <CalendarDays className="h-4 w-4" />
                                    <span>Despesas Este Mês</span>
                                </div>
                                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(expenseSummary.month)}</p>
                            </div>
                             <div className="bg-muted/50 p-4 rounded-lg">
                                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                    <TrendingUp className="h-4 w-4" />
                                    <span>Despesas Este Ano</span>
                                </div>
                                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(expenseSummary.year)}</p>
                            </div>
                        </div>
                     )}
                </CardContent>
            </Card>

            <h3 className="text-lg font-semibold text-foreground">Contas a Pagar Pendentes e Recentes</h3>
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
                        {isLoadingContas ? (
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
            
            <Separator className="my-8" />

            <div className="space-y-4">
                 <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Histórico de Preços de Compras
                </h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar por nome do produto para ver o histórico..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                {searchQuery.trim() && (
                  <div className="rounded-md border">
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead>Data</TableHead>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Fornecedor</TableHead>
                                  <TableHead className="text-right">Preço Unitário</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {isLoadingAllEntradas || isLoadingFornecedores ? (
                                  <TableRow>
                                      <TableCell colSpan={4} className="h-24 text-center">
                                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                      </TableCell>
                                  </TableRow>
                              ) : filteredEntradas.length > 0 ? (
                                  filteredEntradas.map((entry) => (
                                      <TableRow key={entry.id}>
                                          <TableCell>{formatDate(entry.data, true)}</TableCell>
                                          <TableCell className="font-medium">{entry.produtoNome}</TableCell>
                                          <TableCell>{fornecedorMap.get(entry.fornecedorId) || 'Desconhecido'}</TableCell>
                                          <TableCell className="text-right font-mono">{formatCurrency(entry.precoUnitario)}</TableCell>
                                      </TableRow>
                                  ))
                              ) : (
                                  <TableRow>
                                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                          Nenhum resultado para sua busca.
                                      </TableCell>
                                  </TableRow>
                              )}
                          </TableBody>
                      </Table>
                  </div>
                )}
            </div>
        </div>
    );
}
