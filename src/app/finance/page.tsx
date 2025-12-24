
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc, onSnapshot } from 'firebase/firestore';
import type { Expense, Employee, EmployeeAdvance } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Trash2, Calendar, Search, Plus, TrendingUp, ShoppingBasket, HandCoins, FileText, Banknote, Landmark } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

const months = [
  { value: 'all', label: 'Todos os Meses' },
  { value: '0', label: 'Janeiro' },
  { value: '1', label: 'Fevereiro' },
  { value: '2', label: 'Março' },
  { value: '3', label: 'Abril' },
  { value: '4', label: 'Maio' },
  { value: '5', label: 'Junho' },
  { value: '6', label: 'Julho' },
  { value: '7', label: 'Agosto' },
  { value: '8', label: 'Setembro' },
  { value: '9', label: 'Outubro' },
  { value: '10', label: 'Novembro' },
  { value: '11', label: 'Dezembro' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const expenseCategories = {
    'm': 'Mercado',
    's': 'Salário',
    'v': 'Vale',
    'c': 'Contas',
    'i': 'Impostos',
    'o': 'Outros',
};

const categoryIcons: Record<string, React.ElementType> = {
    'Mercado': ShoppingBasket,
    'Salário': HandCoins,
    'Vale': FileText,
    'Contas': Banknote,
    'Impostos': Landmark,
    'Outros': Plus,
};

const categoryColors: Record<string, string> = {
    'Mercado': 'hsl(var(--chart-1))',
    'Salário': 'hsl(var(--chart-2))',
    'Vale': 'hsl(var(--chart-3))',
    'Contas': 'hsl(var(--chart-4))',
    'Impostos': 'hsl(var(--chart-5))',
    'Outros': 'hsl(var(--muted-foreground))',
};


const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs font-bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};


export default function FinancePage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));
  const [searchTerm, setSearchTerm] = useState('');
  const [expenseInput, setExpenseInput] = useState('');

  const employeesQuery = useMemoFirebase(() => user ? query(collection(firestore, 'employees'), where('userId', '==', user.uid)) : null, [firestore, user]);
  const { data: employees, isLoading: isLoadingEmployees } = useCollection<Employee>(employeesQuery);
  
  const expensesQuery = useMemoFirebase(() => user ? query(collection(firestore, 'expenses'), where('userId', '==', user.uid), orderBy('date', 'desc')) : null, [firestore, user]);
  const { data: expenses, isLoading: isLoadingExpenses } = useCollection<Expense>(expensesQuery);
  
  const [allAdvances, setAllAdvances] = useState<EmployeeAdvance[]>([]);
  const [isLoadingAdvances, setIsLoadingAdvances] = useState(true);

  useEffect(() => {
    if (!user || !firestore || !employees) {
        if (!isLoadingEmployees) {
             setAllAdvances([]);
             setIsLoadingAdvances(false);
        }
        return;
    };
    
    setIsLoadingAdvances(true);
    
    if (employees.length === 0) {
        setIsLoadingAdvances(false);
        setAllAdvances([]);
        return;
    }
    
    const advancesData: Record<string, EmployeeAdvance> = {};
    let listenerCount = employees.length;
    let loadedCount = 0;

    const unsubscribers = employees.map(employee => {
        const advancesQuery = query(collection(firestore, `employees/${employee.id}/advances`));
        
        return onSnapshot(advancesQuery, (querySnapshot) => {
            querySnapshot.docChanges().forEach((change) => {
                 const advance = { 
                     ...change.doc.data(), 
                     id: change.doc.id, 
                     userId: user.uid,
                     employeeId: employee.id, 
                     employeeName: employee.name 
                } as EmployeeAdvance;
                
                if (change.type === "removed") {
                    delete advancesData[advance.id];
                } else {
                    advancesData[advance.id] = advance;
                }
            });
            // Update the state with the latest advances from all employees
            setAllAdvances(Object.values(advancesData).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        }, (error) => {
            console.error(`Error fetching advances for employee ${employee.id}:`, error);
            loadedCount++;
            if(loadedCount === listenerCount) setIsLoadingAdvances(false);
        }, () => {
          // onCompletion is not standard for onSnapshot, but we can manage loading state
        });
    });
    
    // Since onSnapshot can take time to fire the first time,
    // we assume loading is finished when all listeners are attached.
    // A more robust solution might involve tracking initial loads.
    setIsLoadingAdvances(false);


    return () => {
      unsubscribers.forEach(unsub => unsub());
    };

  }, [firestore, user, employees, isLoadingEmployees]);


  const filteredData = useMemo(() => {
    const allItems: (Expense | EmployeeAdvance)[] = [...(expenses || []), ...(allAdvances || [])];

    return allItems.filter(item => {
        const itemDate = new Date(item.date);
        const yearMatch = itemDate.getFullYear() === parseInt(selectedYear);
        const monthMatch = selectedMonth === 'all' || itemDate.getMonth() === parseInt(selectedMonth);
        const description = 'description' in item ? item.description : `Vale para ${item.employeeName}`;
        const searchMatch = !searchTerm || description.toLowerCase().includes(searchTerm.toLowerCase()) || ('employeeName' in item && item.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()));

        return yearMatch && monthMatch && searchMatch;
    }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, allAdvances, selectedYear, selectedMonth, searchTerm]);

  const generalExpenses = useMemo(() => filteredData.filter((item): item is Expense => 'description' in item), [filteredData]);
  const employeeExpenses = useMemo(() => filteredData.filter((item): item is EmployeeAdvance => 'employeeId' in item), [filteredData]);

  const annualTotal = useMemo(() => {
      const allYearItems: (Expense | EmployeeAdvance)[] = [...(expenses || []), ...(allAdvances || [])];
      return allYearItems
        .filter(item => new Date(item.date).getFullYear() === parseInt(selectedYear))
        .reduce((sum, item) => sum + item.amount, 0);
  }, [expenses, allAdvances, selectedYear]);

  const categoryData = useMemo(() => {
    const categoryMap: Record<string, number> = {};

    const itemsToProcess = selectedMonth === 'all' 
        ? [...(expenses || []), ...(allAdvances || [])].filter(item => new Date(item.date).getFullYear() === parseInt(selectedYear))
        : filteredData;

    itemsToProcess.forEach(item => {
        let category: string;
        if ('category' in item) { // It's an Expense
            category = item.category;
        } else { // It's an EmployeeAdvance
            category = 'Vale';
        }
        
        if (!categoryMap[category]) {
            categoryMap[category] = 0;
        }
        categoryMap[category] += item.amount;
    });

    return Object.entries(categoryMap).map(([name, value]) => ({
        name,
        value,
        color: categoryColors[name] || 'hsl(var(--muted-foreground))',
        icon: categoryIcons[name] || Plus,
    })).sort((a,b) => b.value - a.value);
  }, [filteredData, expenses, allAdvances, selectedYear, selectedMonth]);


  const handleAddExpense = () => {
    if (!expenseInput.trim() || !user || !firestore) return;

    const parts = expenseInput.trim().split(' ');
    const amountStr = parts.pop();
    const amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : NaN;

    if (isNaN(amount)) {
        toast({ variant: 'destructive', title: 'Valor inválido', description: 'O último valor deve ser um número.' });
        return;
    }

    let categoryKey = parts[0]?.toLowerCase();
    let description = parts.join(' ');
    
    // @ts-ignore
    if (expenseCategories[categoryKey]) {
        description = parts.slice(1).join(' ');
    } else {
        categoryKey = 'o'; // Default to 'Outros'
    }

    const newExpense: Omit<Expense, 'id'> = {
        userId: user.uid,
        // @ts-ignore
        category: expenseCategories[categoryKey],
        description: description || 'Despesa sem descrição',
        amount,
        date: new Date().toISOString(),
    };
    
    addDocumentNonBlocking(collection(firestore, 'expenses'), newExpense);
    toast({ title: 'Despesa adicionada!' });
    setExpenseInput('');
  };
  
  const handleDelete = (item: Expense | EmployeeAdvance) => {
      if (!firestore) return;
      
      let docRef;
      if ('description' in item) { // It's an Expense
        docRef = doc(firestore, 'expenses', item.id);
      } else { // It's an EmployeeAdvance
        docRef = doc(firestore, `employees/${item.employeeId}/advances`, item.id);
      }
      
      deleteDocumentNonBlocking(docRef);
      toast({ title: 'Lançamento excluído.'});
  }

  const formatDateDisplay = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, "d 'de' MMM", { locale: ptBR });
  }

  const isLoading = isLoadingExpenses || isLoadingAdvances || isLoadingEmployees;

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6 flex flex-col sm:flex-row items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Controle Financeiro</h1>
            <p className="text-muted-foreground">Gestão de despesas e vales de funcionários.</p>
          </div>
          <Link href="/" passHref>
              <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
              </Button>
          </Link>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Adicionar Despesa</CardTitle>
            <CardDescription>
              Use o formato: `código descrição valor`. Ex: `m arroz 50`. Códigos: (m)ercado, (s)alário, (c)ontas, (i)mpostos, (o)utros.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center gap-2">
            <Input 
              placeholder="Ex: m arroz, feijão 150.75" 
              className="flex-grow"
              value={expenseInput}
              onChange={(e) => setExpenseInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
            />
            <div className="flex w-full sm:w-auto items-center gap-2">
                <Button variant="outline" className="flex-1 whitespace-nowrap" disabled>
                  <Calendar className="mr-2 h-4 w-4" />
                  {format(new Date(), "d 'de' MMM", { locale: ptBR })}
                </Button>
                <Button onClick={handleAddExpense} className="flex-1"><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controle de Despesas</CardTitle>
            <CardDescription>Selecione o período ou faça uma busca para visualizar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                 <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-[120px]">
                      <Calendar className="mr-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(year => (
                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-[150px]">
                      <Calendar className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map(month => (
                        <SelectItem key={month.value} value={String(month.value)}>{month.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
            </div>
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Buscar por descrição ou funcionário..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>
          </CardContent>
        </Card>

         <Tabs defaultValue="gerais" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="gerais">Despesas Gerais</TabsTrigger>
                <TabsTrigger value="funcionarios">Funcionários (Vales)</TabsTrigger>
            </TabsList>
            <TabsContent value="gerais">
                <Card>
                    <CardContent className="p-4">
                       {isLoading ? <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin" /> : generalExpenses.length > 0 ? (
                           <div className="space-y-2">
                               {generalExpenses.map(item => (
                                   <div key={item.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                                       <div>
                                           <p className="font-medium">{item.description}</p>
                                           <p className="text-xs text-muted-foreground">{formatDateDisplay(item.date)} - <span style={{color: categoryColors[item.category]}}>{item.category}</span></p>
                                       </div>
                                       <div className="flex items-center gap-2">
                                           <p className="font-mono font-semibold">{formatCurrency(item.amount)}</p>
                                           <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                                       </div>
                                   </div>
                               ))}
                           </div>
                       ) : (
                           <p className="text-center text-muted-foreground py-8">Nenhuma despesa geral para este período.</p>
                       )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="funcionarios">
                 <Card>
                    <CardContent className="p-4">
                        {isLoading ? <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin" /> : employeeExpenses.length > 0 ? (
                           <div className="space-y-2">
                               {employeeExpenses.map(item => (
                                   <div key={item.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                                       <div>
                                           <p className="font-medium">Vale para {item.employeeName}</p>
                                           <p className="text-xs text-muted-foreground">{formatDateDisplay(item.date)}</p>
                                       </div>
                                       <div className="flex items-center gap-2">
                                           <p className="font-mono font-semibold">{formatCurrency(item.amount)}</p>
                                           <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                                       </div>
                                   </div>
                               ))}
                           </div>
                       ) : (
                           <p className="text-center text-muted-foreground py-8">Nenhum vale para este período.</p>
                       )}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        <Card>
            <CardHeader>
                <CardTitle>Análise Anual de Despesas ({selectedYear})</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
                <p className="text-muted-foreground">Total do Ano de {selectedYear}</p>
                <p className="text-5xl font-bold text-destructive mt-2">{formatCurrency(annualTotal)}</p>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Detalhes por Categoria</CardTitle>
                 <CardDescription>
                    Referente a {selectedMonth === 'all' ? `todo o ano de ${selectedYear}` : `${months.find(m => m.value === selectedMonth)?.label} de ${selectedYear}`}.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="h-64">
                   {isLoading ? <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin" /> : categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={categoryData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={renderCustomizedLabel}
                                outerRadius={110}
                                fill="#8884d8"
                                dataKey="value"
                                nameKey="name"
                            >
                                {categoryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={3} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    borderColor: 'hsl(var(--border))',
                                    borderRadius: 'var(--radius)',
                                }}
                                formatter={(value: number) => formatCurrency(value)}
                             />
                        </PieChart>
                    </ResponsiveContainer>
                   ) : <p className="text-center text-muted-foreground">Sem dados para exibir o gráfico.</p>}
                </div>
                <div className="space-y-3">
                    {categoryData.map(category => {
                        const Icon = category.icon;
                        return (
                            <div key={category.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Icon className="h-5 w-5" style={{color: category.color}} />
                                    <span className="font-medium">{category.name}</span>
                                </div>
                                <span className="font-mono font-semibold">{formatCurrency(category.value)}</span>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>

      </div>
    </div>
  );
}

    

    