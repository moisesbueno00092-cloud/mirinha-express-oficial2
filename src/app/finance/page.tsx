'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc, deleteDoc } from 'firebase/firestore';
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
import { Loader2, ArrowLeft, Trash2, Calendar, Search, Filter, Plus, Repeat, Code, TrendingUp, ShoppingBasket, HandCoins, FileText, Banknote, Landmark } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const months = [
  { value: 0, label: 'Janeiro' },
  { value: 1, label: 'Fevereiro' },
  { value: 2, label: 'Março' },
  { value: 3, label: 'Abril' },
  { value: 4, label: 'Maio' },
  { value: 5, label: 'Junho' },
  { value: 6, label: 'Julho' },
  { value: 7, label: 'Agosto' },
  { value: 8, label: 'Setembro' },
  { value: 9, label: 'Outubro' },
  { value: 10, label: 'Novembro' },
  { value: 11, label: 'Dezembro' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const categoryData = [
    { name: 'Mercado', value: 48574.90, color: 'hsl(var(--chart-1))', icon: ShoppingBasket },
    { name: 'Salário', value: 35200.00, color: 'hsl(var(--chart-2))', icon: HandCoins },
    { name: 'Vale', value: 7850.00, color: 'hsl(var(--chart-3))', icon: FileText },
    { name: 'Contas', value: 32789.60, color: 'hsl(var(--chart-4))', icon: Banknote },
    { name: 'Impostos', value: 22401.90, color: 'hsl(var(--chart-5))', icon: Landmark },
    { name: 'Outros', value: 5500.00, color: 'hsl(var(--muted-foreground))', icon: Plus },
];

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
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
  const [searchTerm, setSearchTerm] = useState('');


  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  }

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-8">
       <header className="mb-6 flex flex-col items-center justify-center text-center">
          <Link href="/">
            <h1 className="text-4xl font-bold text-primary" style={{fontFamily: "'Dancing Script', cursive"}}>Restaurante da Mirinha</h1>
          </Link>
          <p className="text-muted-foreground text-sm sm:text-base">Sistema de Gerenciamento de Pedidos</p>
        </header>

         <div className="flex items-center justify-center space-x-2 border-b mb-6">
            <Link href="/" passHref>
                <Button variant="ghost">Controle</Button>
            </Link>
            <Button variant="ghost" className="border-b-2 border-primary text-primary">Despesas</Button>
             <Link href="/history" passHref>
                <Button variant="ghost">Histórico</Button>
            </Link>
             <Link href="/accounts" passHref>
                <Button variant="ghost">Caderneta</Button>
            </Link>
            <Button variant="ghost" disabled>Caixa</Button>
        </div>


      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Adicionar Despesa</CardTitle>
            <CardDescription>
              Use: &quot;m 3x Arroz 50&quot; (categoria + quantidade) ou &quot;3x Arroz 50&quot; (sem categoria) para multiplicação.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center gap-4">
            <Input placeholder="Digite a descrição e o valor" className="flex-grow" />
            <div className="flex items-center gap-2">
                <Button variant="outline" className="whitespace-nowrap">
                  <Calendar className="mr-2 h-4 w-4" />
                  {formatDate(new Date())}
                </Button>
                <Button variant="outline"><Repeat className="mr-2 h-4 w-4" />Lançar Despesa Parcelada</Button>
                <Button variant="default" className="bg-red-600 hover:bg-red-700"><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5" /> Agrupar Lançamentos por Código</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Input placeholder="Digite um código (ex: Mega G)" className="flex-grow" />
            <Button variant="default" className="bg-red-600 hover:bg-red-700">Definir Grupo</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controle de Despesas</CardTitle>
            <CardDescription>Selecione o período ou faça uma busca para visualizar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="whitespace-nowrap"><Filter className="mr-2 h-4 w-4" />Filtrar por Grupo</Button>
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
                <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
            </TabsList>
            <TabsContent value="gerais">
                <Card>
                    <CardContent className="p-6">
                        <p className="text-center text-muted-foreground">Nenhuma despesa geral para este período.</p>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="funcionarios">
                 <Card>
                    <CardContent className="p-6">
                        <p className="text-center text-muted-foreground">Nenhuma despesa com funcionário para este período.</p>
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
                <p className="text-5xl font-bold text-red-500 mt-2">{formatCurrency(152316.40)}</p>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Detalhes por Categoria</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="h-64">
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
