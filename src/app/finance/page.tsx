
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import type { Payable } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2, PlusCircle, DollarSign, Calendar } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { deleteDocumentNonBlocking, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (date: Date | string) => {
    if (!date) return 'N/A';
    return format(new Date(date), "dd/MM/yyyy");
};

function PayablesManager() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    // Data fetching
    const payablesQuery = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'payables'), where('userId', '==', user.uid), orderBy('dueDate', 'asc')) : null), [firestore, user]);
    const { data: payables, isLoading, error } = useCollection<Payable>(payablesQuery);

    // State for forms and modals
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [dueDate, setDueDate] = useState<Date | undefined>();
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    const handleAddPayable = async () => {
        if (!firestore || !user || !description || !amount || !dueDate) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos.' });
            return;
        }
        const parsedAmount = parseFloat(amount.replace(',', '.'));
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Valor inválido.' });
            return;
        }

        const newPayable: Omit<Payable, 'id'> = {
            userId: user.uid,
            description,
            amount: parsedAmount,
            dueDate: dueDate.toISOString(),
            isPaid: false
        };

        await addDocumentNonBlocking(collection(firestore, 'payables'), newPayable);
        
        toast({ title: 'Sucesso', description: 'Conta a pagar adicionada.' });
        setDescription('');
        setAmount('');
        setDueDate(undefined);
    };

    const confirmDelete = () => {
        if (!firestore || !itemToDelete) return;
        deleteDocumentNonBlocking(doc(firestore, 'payables', itemToDelete));
        toast({ title: 'Sucesso', description: 'Conta a pagar removida.' });
        setItemToDelete(null);
    };
    
    const handleTogglePaid = (payable: Payable) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'payables', payable.id);
        updateDocumentNonBlocking(docRef, { isPaid: !payable.isPaid });
    }

    const totalUnpaid = useMemo(() => {
        return payables?.filter(p => !p.isPaid).reduce((sum, p) => sum + p.amount, 0) || 0;
    }, [payables]);

    return (
        <>
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>Essa ação não pode ser desfeita. Isso excluirá permanentemente a conta a pagar.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <PlusCircle className="h-5 w-5" />
                        Adicionar Conta a Pagar
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr,1fr,auto] gap-2 items-end">
                        <Input placeholder="Descrição da conta" value={description} onChange={e => setDescription(e.target.value)} />
                        <Input placeholder="Valor (R$)" value={amount} onChange={e => setAmount(e.target.value)} />
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !dueDate && "text-muted-foreground"
                                )}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dueDate ? format(dueDate, "PPP", { locale: ptBR }) : <span>Vencimento</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <CalendarComponent
                                mode="single"
                                selected={dueDate}
                                onSelect={setDueDate}
                                initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <Button onClick={handleAddPayable}>Adicionar</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Contas a Pagar</CardTitle>
                     <p className="text-sm text-muted-foreground pt-1">
                        Total em aberto: <span className="font-bold text-destructive">{formatCurrency(totalUnpaid)}</span>
                     </p>
                </CardHeader>
                <CardContent>
                    {isLoading && <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin" />}
                    {!isLoading && payables?.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma conta a pagar registrada.</p>}
                    <div className="space-y-2">
                        {payables && payables.map(p => (
                            <div key={p.id} className={cn("border p-3 rounded-lg flex items-center justify-between gap-4", p.isPaid && "bg-muted/30")}>
                                <div className="flex items-center gap-4">
                                     <Checkbox 
                                        id={`paid-${p.id}`} 
                                        checked={p.isPaid}
                                        onCheckedChange={() => handleTogglePaid(p)}
                                    />
                                    <div className={cn(p.isPaid && "line-through text-muted-foreground")}>
                                        <p className="font-semibold">{p.description}</p>
                                        <p className="text-sm">
                                            Vence em: <span className="font-medium">{formatDate(p.dueDate)}</span> - <span className="font-mono font-bold">{formatCurrency(p.amount)}</span>
                                        </p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setItemToDelete(p.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </>
    );
}


export default function FinancePage() {
    const { user, isUserLoading } = useUser();

    if (isUserLoading || !user) {
        return (
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        );
    }

    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-8">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold">Controlo Financeiro</h1>
                <Link href="/" passHref>
                    <Button variant="outline">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </Link>
            </div>
            <PayablesManager />
        </div>
    );
}
