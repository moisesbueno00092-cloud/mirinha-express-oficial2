'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import type { Payable } from '@/types';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2, Calendar } from 'lucide-react';
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
import { deleteDocumentNonBlocking, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (date: Date | string) => {
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
};

// Schema for form validation
const payableSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.coerce.number().min(0.01, 'Valor deve ser positivo'),
  dueDate: z.date(),
});

function PayableForm({ onAdd }: { onAdd: (data: Omit<Payable, 'id' | 'userId' | 'isPaid'>) => void }) {
  const { register, handleSubmit, control, formState: { errors }, reset } = useForm<z.infer<typeof payableSchema>>({
    resolver: zodResolver(payableSchema),
    defaultValues: { dueDate: new Date() }
  });

  const onSubmit = (data: z.infer<typeof payableSchema>) => {
    onAdd({ ...data, dueDate: data.dueDate.toISOString() });
    reset({ description: '', amount: undefined, dueDate: new Date() });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input placeholder="Descrição da conta" {...register('description')} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input type="number" step="0.01" placeholder="Valor (ex: 350,00)" {...register('amount')} />
        <Controller
            name="dueDate"
            control={control}
            render={({ field }) => (
            <Popover>
                <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, 'PPP', { locale: ptBR }) : <span>Data de Vencimento</span>}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                </PopoverContent>
            </Popover>
            )}
        />
      </div>
      {errors.description && <p className="text-destructive text-xs">{errors.description.message}</p>}
      {errors.amount && <p className="text-destructive text-xs">{errors.amount.message}</p>}
      <Button type="submit" className="w-full">Adicionar Conta a Pagar</Button>
    </form>
  );
}

export default function FinancePage() {
    const firestore = useFirestore();
    const { user, isUserLoading } = useUser();
    const { toast } = useToast();

    // Data fetching
    const payablesQuery = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'payables'), where('userId', '==', user.uid), orderBy('dueDate', 'asc')) : null), [firestore, user]);
    
    const { data: payables, isLoading: isLoadingPayables, error: payablesError } = useCollection<Payable>(payablesQuery);

    // State for modals and forms
    const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'payable' } | null>(null);

    const handleAddPayable = (data: Omit<Payable, 'id' | 'userId' | 'isPaid'>) => {
        if (!firestore || !user) return;
        const collectionRef = collection(firestore, 'payables');
        addDocumentNonBlocking(collectionRef, { ...data, userId: user.uid, isPaid: false });
        toast({ title: 'Sucesso', description: 'Conta a pagar adicionada.' });
    };

    const handleTogglePayable = (payable: Payable) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'payables', payable.id);
        updateDocumentNonBlocking(docRef, { isPaid: !payable.isPaid });
        toast({ title: 'Status Alterado', description: `Conta "${payable.description}" marcada como ${!payable.isPaid ? 'paga' : 'não paga'}.` });
    };
    
    const confirmDelete = () => {
        if (!firestore || !itemToDelete) return;
        const docRef = doc(firestore, 'payables', itemToDelete.id);
        deleteDocumentNonBlocking(docRef);
        toast({ title: 'Sucesso', description: 'Item removido.' });
        setItemToDelete(null);
    };

    const totalPayables = useMemo(() => payables?.filter(p => !p.isPaid).reduce((sum, item) => sum + item.amount, 0) || 0, [payables]);

    if (isUserLoading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }

    if (payablesError) {
      return (
        <div className="container mx-auto p-8 text-center text-destructive">
          <h1 className="text-2xl font-bold">Erro ao Carregar Dados</h1>
          <p className="mt-2">{payablesError.message}</p>
          <Link href="/" passHref>
              <Button variant="outline" className="mt-4">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
              </Button>
          </Link>
        </div>
      );
    }
    
  return (
    <>
        <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                Essa ação não pode ser desfeita e excluirá permanentemente o item selecionado.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="container mx-auto max-w-5xl p-4 sm:p-8">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold">Controle Financeiro</h1>
                <Link href="/" passHref>
                    <Button variant="outline">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Contas a Pagar (Abertas)</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-500">{formatCurrency(totalPayables)}</div>
                        <p className="text-xs text-muted-foreground">Soma de todas as contas não pagas</p>
                    </CardContent>
                </Card>
            </div>

            <div>
              <Card>
                  <CardHeader>
                      <CardTitle>Nova Conta a Pagar</CardTitle>
                  </CardHeader>
                  <CardContent>
                     <PayableForm onAdd={handleAddPayable} />
                  </CardContent>
              </Card>
              <Card className="mt-6">
                  <CardHeader>
                      <CardTitle>Contas a Pagar</CardTitle>
                  </CardHeader>
                  <CardContent>
                       {isLoadingPayables ? <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin" /> : 
                       <Table>
                          <TableHeader>
                          <TableRow>
                              <TableHead className="w-[100px]">Paga?</TableHead>
                              <TableHead>Vencimento</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                          </TableHeader>
                          <TableBody>
                          {payables && payables.map(item => (
                              <TableRow key={item.id} className={cn(item.isPaid && 'text-muted-foreground line-through')}>
                                  <TableCell>
                                      <Switch checked={item.isPaid} onCheckedChange={() => handleTogglePayable(item)} />
                                  </TableCell>
                                  <TableCell>{formatDate(item.dueDate)}</TableCell>
                                  <TableCell className="font-medium">{item.description}</TableCell>
                                  <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                                  <TableCell>
                                      <Button variant="ghost" size="icon" onClick={() => setItemToDelete({id: item.id, type: 'payable'})}>
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                  </TableCell>
                              </TableRow>
                          ))}
                          </TableBody>
                      </Table>
                      }
                      { !isLoadingPayables && payables?.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma conta a pagar registrada.</p>}
                  </CardContent>
              </Card>
            </div>
        </div>
    </>
  )
}
