
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import type { Payable } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2, PlusCircle, CheckCircle, Circle, DollarSign, Calendar } from 'lucide-react';
import Link from 'next/link';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { deleteDocumentNonBlocking, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (date: Date | string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
};


export default function FinancePage() {
    const firestore = useFirestore();
    const { user, isUserLoading } = useUser();
    const { toast } = useToast();

    // Data fetching for Payables
    const payablesQuery = useMemoFirebase(() => (
        firestore && user ? query(
            collection(firestore, 'payables'), 
            where('userId', '==', user.uid), 
            orderBy('dueDate', 'asc')
        ) : null
    ), [firestore, user]);
    const { data: payables, isLoading: isLoadingPayables, error: errorPayables } = useCollection<Payable>(payablesQuery);

    // State for forms
    const [newPayableDesc, setNewPayableDesc] = useState('');
    const [newPayableAmount, setNewPayableAmount] = useState('');
    const [newPayableDueDate, setNewPayableDueDate] = useState<Date | undefined>();
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);


    const handleAddPayable = async () => {
        if (!firestore || !user || !newPayableDesc || !newPayableAmount || !newPayableDueDate) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos.' });
            return;
        }
        const amount = parseFloat(newPayableAmount.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Valor inválido.' });
            return;
        }

        const newPayable: Omit<Payable, 'id'> = {
            userId: user.uid,
            description: newPayableDesc,
            amount,
            dueDate: newPayableDueDate.toISOString(),
            isPaid: false,
        };

        await addDocumentNonBlocking(collection(firestore, 'payables'), newPayable);
        
        toast({ title: 'Sucesso', description: `Conta a pagar "${newPayableDesc}" adicionada.` });
        setNewPayableDesc('');
        setNewPayableAmount('');
        setNewPayableDueDate(undefined);
    };

    const confirmDelete = async (collectionName: 'payables', id: string) => {
        if (!firestore || !itemToDelete) return;
        
        const docRef = doc(firestore, collectionName, id);
        deleteDocumentNonBlocking(docRef);

        toast({ title: 'Sucesso', description: 'Item removido.' });
        setItemToDelete(null);
    };

    const togglePaidStatus = async (payable: Payable) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'payables', payable.id);
        updateDocumentNonBlocking(docRef, { isPaid: !payable.isPaid });
        toast({
            title: 'Status Alterado',
            description: `${payable.description} foi marcado como ${!payable.isPaid ? 'pago' : 'não pago'}.`
        })
    };
    
    if (isUserLoading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }
    
    const renderError = (title: string, error: Error | null) => (
        <div className="container mx-auto p-8 text-center text-destructive">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="mt-2">{error?.message}</p>
             <Link href="/" passHref>
                <Button variant="outline" className="mt-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                </Button>
            </Link>
        </div>
    );

    if (errorPayables) {
        return renderError('Erro ao Carregar Contas a Pagar', errorPayables);
    }

    const totalOpenPayables = payables?.filter(p => !p.isPaid).reduce((acc, p) => acc + p.amount, 0) || 0;

    return (
        <>
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                    Essa ação não pode ser desfeita. Isso excluirá permanentemente o item selecionado.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => confirmDelete('payables', itemToDelete!)}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <div className="container mx-auto max-w-4xl p-4 sm:p-8">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold">Contas a Pagar</h1>
                    <Link href="/" passHref>
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Voltar
                        </Button>
                    </Link>
                </div>
                
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <PlusCircle className="h-5 w-5" />
                            Adicionar Nova Conta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr,1fr,auto] gap-2 items-end">
                            <Input placeholder="Descrição da conta" value={newPayableDesc} onChange={e => setNewPayableDesc(e.target.value)} />
                            <Input placeholder="Valor" value={newPayableAmount} onChange={e => setNewPayableAmount(e.target.value)} />
                            <DatePicker date={newPayableDueDate} setDate={setNewPayableDueDate} placeholder="Data de Vencimento"/>
                            <Button onClick={handleAddPayable}>Adicionar</Button>
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Contas Pendentes</CardTitle>
                        <div className="text-right">
                           <p className="text-sm text-muted-foreground">Total em Aberto</p>
                           <p className="text-2xl font-bold text-destructive">{formatCurrency(totalOpenPayables)}</p>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoadingPayables ? <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin" /> : 
                            (payables && payables.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead>Vencimento</TableHead>
                                            <TableHead className="text-right">Valor</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {payables.map(payable => (
                                            <TableRow key={payable.id} className={cn(payable.isPaid && 'text-muted-foreground line-through')}>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" onClick={() => togglePaidStatus(payable)}>
                                                        {payable.isPaid ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5" />}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="font-medium">{payable.description}</TableCell>
                                                <TableCell>{formatDate(payable.dueDate)}</TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(payable.amount)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => setItemToDelete(payable.id)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                               <p className="text-center text-muted-foreground py-8">Nenhuma conta a pagar registrada.</p>
                            ))
                        }
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

