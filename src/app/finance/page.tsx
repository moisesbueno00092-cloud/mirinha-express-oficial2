
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc, deleteDoc, addDoc, updateDoc } from 'firebase/firestore';
import type { Expense, Payable, Employee, EmployeeAdvance } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2, User, Package, Utensils, CalendarDays, ReceiptText, Plus, DollarSign, Briefcase, FileText, Search, ChevronsUpDown, Check } from 'lucide-react';
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
import { addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';
import usePersistentState from '@/hooks/use-persistent-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
    const [category, setCategory] = useState('');
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    
    const expensesQuery = useMemoFirebase(() => (
        firestore && user ? query(collection(firestore, 'expenses'), where('userId', '==', user.uid)) : null
    ), [firestore, user]);

    const { data: expenses, isLoading } = useCollection<Expense>(expensesQuery);
    
    const sortedExpenses = useMemo(() => {
        if (!expenses) return [];
        return [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [expenses]);
    
    const filteredExpenses = useMemo(() => {
        if (!sortedExpenses) return [];
        const lowercasedFilter = searchTerm.toLowerCase();
        return sortedExpenses.filter(expense => 
            expense.description.toLowerCase().includes(lowercasedFilter) ||
            expense.category.toLowerCase().includes(lowercasedFilter)
        );
    }, [sortedExpenses, searchTerm]);

    const existingCategories = useMemo(() => {
        if (!expenses) return [];
        const categories = expenses.map(exp => exp.category);
        return [...new Set(categories)].sort((a, b) => a.localeCompare(b));
    }, [expenses]);


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
        setCategory('');
    };

    const handleComplexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const parts = value.split(' ');
        const lastPart = parts[parts.length - 1];
        
        const priceMatch = lastPart.match(/(\d+([,.]\d{1,2})?)$/);
        
        if (priceMatch && priceMatch[0] && parts.length > 1) {
            const price = priceMatch[0];
            const desc = parts.slice(0, parts.length - 1).join(' ');
            setDescription(desc);
            setAmount(price);
        } else {
            setDescription(value);
            setAmount('');
        }
    }
    
    const totalExpenses = useMemo(() => filteredExpenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0, [filteredExpenses]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Adicionar Despesa</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAddExpense} className="space-y-4">
                        <div className="flex flex-col sm:flex-row items-center gap-2">
                           <div className="flex-grow w-full">
                                <Label htmlFor="exp-desc" className="sr-only">Descrição e Valor</Label>
                                <Input 
                                    id="exp-desc" 
                                    value={`${description} ${amount}`.trim()} 
                                    onChange={handleComplexInput}
                                    placeholder="Digite a descrição e o valor (ex: Compras 50,50)" 
                                    className="h-11 text-base"
                                />
                           </div>
                           <CategoryCombobox existingCategories={existingCategories} value={category} setValue={setCategory} />
                           <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("h-11 w-full sm:w-auto justify-start text-left font-normal", !date && "text-muted-foreground")}>
                                        <CalendarDays className="mr-2 h-4 w-4" />
                                        {date ? format(date, "d 'de' MMMM", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus locale={ptBR}/>
                                </PopoverContent>
                            </Popover>
                           <Button type="submit" className="h-11 w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white">
                                <Plus className="mr-2 h-4 w-4" />
                                Adicionar
                           </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Controle de Despesas</CardTitle>
                     <div className="relative pt-2">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 text-muted-foreground -translate-y-1/2" />
                        <Input 
                           placeholder="Buscar por descrição ou categoria..."
                           value={searchTerm}
                           onChange={e => setSearchTerm(e.target.value)}
                           className="pl-10"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? <div className="flex justify-center py-8"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div> : (
                        <>
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
                                {filteredExpenses?.map(exp => (
                                    <TableRow key={exp.id}>
                                        <TableCell>{formatDate(exp.date)}</TableCell>
                                        <TableCell className="font-medium">{exp.description}</TableCell>
                                        <TableCell><Badge variant="secondary">{exp.category}</Badge></TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(exp.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                         {filteredExpenses.length === 0 && (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>Nenhuma despesa encontrada.</p>
                            </div>
                         )}
                        </>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end font-bold">
                    <div className="flex items-center gap-4">
                        <span>Total:</span>
                        <span className="text-xl text-red-500">{formatCurrency(totalExpenses)}</span>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}

function CategoryCombobox({ existingCategories, value, setValue }: { existingCategories: string[], value: string, setValue: (value: string) => void }) {
    const [open, setOpen] = useState(false)
    const [inputValue, setInputValue] = useState("")

    useEffect(() => {
        setInputValue(value)
    }, [value])

    const handleSelect = (currentValue: string) => {
        const newValue = currentValue === value ? "" : currentValue
        setValue(newValue)
        setInputValue(newValue)
        setOpen(false)
    }
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value)
        setValue(e.target.value)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="h-11 w-full sm:w-[200px] justify-between"
                >
                    <span className="truncate">{value || "Selecionar Fornecedor..."}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput
                        value={inputValue}
                        onValueChange={setInputValue}
                        onBlur={() => setValue(inputValue)}
                        placeholder="Buscar ou criar categoria..."
                    />
                    <CommandList>
                        <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                        <CommandGroup>
                            {existingCategories.map((category) => (
                                <CommandItem
                                    key={category}
                                    value={category}
                                    onSelect={handleSelect}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === category ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {category}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
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
        firestore && user ? query(collection(firestore, 'payables'), where('userId', '==', user.uid)) : null
    ), [firestore, user]);

    const { data: payables, isLoading } = useCollection<Payable>(payablesQuery);
    
    const sortedPayables = useMemo(() => {
        if (!payables) return [];
        return [...payables].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }, [payables]);


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

    const upcomingPayables = useMemo(() => sortedPayables?.filter(p => !p.isPaid) || [], [sortedPayables]);
    const paidPayables = useMemo(() => sortedPayables?.filter(p => p.isPaid) || [], [sortedPayables]);
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
