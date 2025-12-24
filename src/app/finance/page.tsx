
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc, deleteDoc, addDoc, updateDoc } from 'firebase/firestore';
import type { Expense, Payable, Employee, EmployeeAdvance } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2, User, Package, Utensils, CalendarDays, ReceiptText, Plus, DollarSign, Briefcase, FileText } from 'lucide-react';
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
import usePersistentState from '@/hooks/use-persistent-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (date: Date | string) => {
    if (!date) return '-';
    const aDate = typeof date === 'string' ? new Date(date) : date;
    return format(aDate, "dd/MM/yyyy");
};

// --- Despesas Component ---
function ExpensesTab() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<'Fornecedor' | 'Conta Fixa' | 'Salário' | 'Imposto' | 'Outros'>('Outros');
    const [date, setDate] = useState<Date | undefined>(new Date());
    
    const expensesQuery = useMemoFirebase(() => (
        firestore && user ? query(collection(firestore, 'expenses'), where('userId', '==', user.uid), orderBy('date', 'desc')) : null
    ), [firestore, user]);

    const { data: expenses, isLoading } = useCollection<Expense>(expensesQuery);

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !firestore || !description || !amount || !date || !category) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos.' });
            return;
        }

        const newExpense: Omit<Expense, 'id'> = {
            userId: user.uid,
            description,
            amount: parseFloat(amount.replace(',', '.')),
            category,
            date: date.toISOString(),
        };

        const expensesCollectionRef = collection(firestore, "expenses");
        await addDocumentNonBlocking(expensesCollectionRef, newExpense);

        toast({ title: 'Sucesso!', description: 'Despesa adicionada.' });
        setDescription('');
        setAmount('');
    };
    
    const totalExpenses = useMemo(() => expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0, [expenses]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Adicionar Nova Despesa</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAddExpense} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="exp-desc">Descrição</Label>
                                <Input id="exp-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Compras no atacado" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exp-amount">Valor</Label>
                                <Input id="exp-amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
                            </div>
                        </div>
                         <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Categoria</Label>
                                <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Fornecedor">Fornecedor</SelectItem>
                                        <SelectItem value="Conta Fixa">Conta Fixa</SelectItem>
                                        <SelectItem value="Salário">Salário</SelectItem>
                                        <SelectItem value="Imposto">Imposto</SelectItem>
                                        <SelectItem value="Outros">Outros</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Data</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                                            <CalendarDays className="mr-2 h-4 w-4" />
                                            {date ? format(date, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <Button type="submit">Adicionar Despesa</Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Histórico de Despesas</CardTitle>
                    <div className="text-right">
                         <p className="text-sm text-muted-foreground">Total Gasto</p>
                         <p className="text-xl font-bold text-destructive">{formatCurrency(totalExpenses)}</p>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Categoria</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {expenses?.map(exp => (
                                    <TableRow key={exp.id}>
                                        <TableCell>{formatDate(exp.date)}</TableCell>
                                        <TableCell>{exp.description}</TableCell>
                                        <TableCell><Badge variant="secondary">{exp.category}</Badge></TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(exp.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// --- Contas a Pagar Component ---
function PayablesTab() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [dueDate, setDueDate] = useState<Date | undefined>();

    const payablesQuery = useMemoFirebase(() => (
        firestore && user ? query(collection(firestore, 'payables'), where('userId', '==', user.uid), orderBy('dueDate', 'asc')) : null
    ), [firestore, user]);

    const { data: payables, isLoading } = useCollection<Payable>(payablesQuery);

    const handleAddPayable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !firestore || !description || !amount || !dueDate) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos.' });
            return;
        }

        const newPayable: Omit<Payable, 'id'> = {
            userId: user.uid,
            description,
            amount: parseFloat(amount.replace(',', '.')),
            dueDate: dueDate.toISOString(),
            isPaid: false,
        };

        const payablesCollectionRef = collection(firestore, "payables");
        await addDocumentNonBlocking(payablesCollectionRef, newPayable);

        toast({ title: 'Sucesso!', description: 'Conta adicionada.' });
        setDescription('');
        setAmount('');
        setDueDate(undefined);
    };

    const togglePaidStatus = (payable: Payable) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'payables', payable.id);
        updateDocumentNonBlocking(docRef, { isPaid: !payable.isPaid });
    };

    const upcomingPayables = useMemo(() => payables?.filter(p => !p.isPaid) || [], [payables]);
    const paidPayables = useMemo(() => payables?.filter(p => p.isPaid) || [], [payables]);
    const totalUpcoming = useMemo(() => upcomingPayables.reduce((sum, p) => sum + p.amount, 0), [upcomingPayables]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader><CardTitle>Adicionar Conta a Pagar</CardTitle></CardHeader>
                <CardContent>
                    <form onSubmit={handleAddPayable} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="pay-desc">Descrição</Label>
                                <Input id="pay-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Boleto de energia" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pay-amount">Valor</Label>
                                <Input id="pay-amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Data de Vencimento</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                                        <CalendarDays className="mr-2 h-4 w-4" />
                                        {dueDate ? format(dueDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus /></PopoverContent>
                            </Popover>
                        </div>
                        <Button type="submit">Adicionar Conta</Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Contas a Vencer</CardTitle>
                     <div className="text-right">
                         <p className="text-sm text-muted-foreground">Total a Pagar</p>
                         <p className="text-xl font-bold text-destructive">{formatCurrency(totalUpcoming)}</p>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">Paga</TableHead>
                                    <TableHead>Vencimento</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {upcomingPayables.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell><Checkbox checked={p.isPaid} onCheckedChange={() => togglePaidStatus(p)} /></TableCell>
                                        <TableCell>{formatDate(p.dueDate)}</TableCell>
                                        <TableCell>{p.description}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(p.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}


// --- Funcionários Component ---
function EmployeesTab() {
    // Placeholder - Logic to be implemented
    return (
        <div className="text-center text-muted-foreground py-16">
            <Briefcase className="mx-auto h-12 w-12" />
            <h2 className="mt-4 text-xl font-semibold">Controle de Funcionários</h2>
            <p className="mt-2 text-sm">Funcionalidade em desenvolvimento.</p>
        </div>
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
        <div className="container mx-auto max-w-5xl p-4 sm:p-8">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold">Despesas</h1>
                <div className="flex items-center gap-2">
                    <Link href="/" passHref>
                        <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
                    </Link>
                </div>
            </div>

            <Tabs defaultValue="expenses" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="expenses"><DollarSign className="mr-2 h-4 w-4"/>Despesas</TabsTrigger>
                    <TabsTrigger value="payables"><FileText className="mr-2 h-4 w-4"/>Contas a Pagar</TabsTrigger>
                    <TabsTrigger value="employees"><Briefcase className="mr-2 h-4 w-4"/>Funcionários</TabsTrigger>
                </TabsList>
                <TabsContent value="expenses" className="mt-6">
                   <ExpensesTab />
                </TabsContent>
                <TabsContent value="payables" className="mt-6">
                   <PayablesTab />
                </TabsContent>
                <TabsContent value="employees" className="mt-6">
                    <EmployeesTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
