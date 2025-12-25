
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Loader2, ArrowLeft, Trash2, Edit, ArrowUpCircle } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"


import type { DailyReport, Item } from '@/types';


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const getDayName = (date: Date) => {
    return format(date, 'EEEE', { locale: ptBR });
}

export default function ReportsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [currentMonth, setCurrentMonth] = useState(new Date());

  const dailyReportsRef = useMemoFirebase(
    () => (firestore && user ? collection(firestore, 'daily_reports') : null), 
    [firestore, user]
  );
  
  const { data: savedReports, isLoading: isLoadingReports } = useCollection<DailyReport>(dailyReportsRef);
  
  const reportsByDay = useMemo(() => {
    if (!savedReports) return {};

    return savedReports.reduce((acc, report) => {
      const day = report.id;
      if (!acc[day]) {
        acc[day] = [];
      }
      acc[day].push(report);
      return acc;
    }, {} as Record<string, DailyReport[]>);
  }, [savedReports]);

  const monthInterval = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const ProportionChart = ({ report }: { report: DailyReport }) => {
    const chartData = [
      { name: 'Vendas', value: report.totalAVista, fill: 'hsl(var(--chart-1))' },
      { name: 'Fiado', value: report.totalFiado, fill: 'hsl(var(--destructive))' },
    ];
    const chartConfig = {
      vendas: { label: "Vendas", color: "hsl(var(--chart-1))" },
      fiado: { label: "Fiado", color: "hsl(var(--destructive))" },
    };

    return (
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-[150px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={30}
              strokeWidth={5}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
    );
  };
  
  const renderItemCounts = (report: DailyReport) => {
    const counts = {
        totalMarmitas: report.totalMarmitas,
        totalKg: report.totalKg,
        totalBomboniere: report.totalBomboniere,
    };
    
    // In a real scenario, you'd calculate Rua counts from items,
    // but for this example, we'll just show total.
    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
                <h4 className="font-semibold mb-1">Total</h4>
                <ul>
                    {counts.totalMarmitas > 0 && <li>Marmitas: {counts.totalMarmitas}</li>}
                    {counts.totalKg > 0 && <li>KG: {counts.totalKg}</li>}
                    {counts.totalBomboniere > 0 && <li>Bomboniere: {counts.totalBomboniere}</li>}
                </ul>
            </div>
             <div>
                <h4 className="font-semibold mb-1">Rua</h4>
                 <ul>
                    {/* Placeholder */}
                </ul>
            </div>
        </div>
    )
  }


  if (isUserLoading || isLoadingReports) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" passHref>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatórios Salvos no Mês</h1>
            <p className="text-muted-foreground">Detalhes de cada relatório salvo, agrupado por dia.</p>
          </div>
        </div>
      </header>

      <main className="space-y-4">
        {monthInterval.reverse().map(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayReports = reportsByDay[dateStr];
            if (!dayReports) return null;

            const totalDia = dayReports.reduce((sum, report) => sum + report.totalGeral, 0);

            return (
                <Card key={dateStr}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-4">
                            <div className="text-center">
                                <p className="text-2xl font-bold">{format(date, 'dd')}</p>
                                <p className="text-xs uppercase text-muted-foreground">{format(date, 'MMM', { locale: ptBR })}</p>
                            </div>
                            <div>
                                <p className="font-semibold">{getDayName(date)}</p>
                                <p className="text-sm text-muted-foreground">{format(date, 'dd/MM/yyyy')}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-muted-foreground">Total do Dia</p>
                            <p className="text-xl font-bold text-primary flex items-center gap-1">{formatCurrency(totalDia)} <ArrowUpCircle className="h-4 w-4 text-green-500" /></p>
                        </div>
                    </CardHeader>
                    <CardContent>
                         <Accordion type="single" collapsible className="w-full">
                           {dayReports.map((report, index) => (
                             <AccordionItem value={`item-${index}`} key={report.id + index}>
                               <AccordionTrigger>
                                  <div className="flex justify-between items-center w-full pr-4">
                                      <div className="flex items-center gap-2">
                                        <p className="font-semibold">Relatório #{index + 1}</p>
                                        {report.createdAt && (
                                          <p className="text-sm text-muted-foreground">({format(parseISO(report.createdAt), 'HH:mm:ss')})</p>
                                        )}
                                      </div>
                                      <p className="text-lg font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
                                  </div>
                               </AccordionTrigger>
                               <AccordionContent className="p-2">
                                  <Card className="bg-card/50">
                                    <CardHeader>
                                      <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg">Relatório #{index + 1} - FATURAMENTO</CardTitle>
                                            <CardDescription>{formatCurrency(report.totalGeral)}</CardDescription>
                                        </div>
                                        <div className="flex items-center -mt-2">
                                            <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                      </div>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Resumo Financeiro */}
                                        <div className="md:col-span-1 space-y-2">
                                            <h3 className="font-semibold text-center md:text-left">Resumo Financeiro</h3>
                                             <Separator />
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between"><span>Vendas Salão:</span> <span className="font-mono">{formatCurrency(report.totalAVista - report.totalTaxas)}</span></div>
                                                <div className="flex justify-between"><span>Vendas Rua:</span> <span className="font-mono">{formatCurrency(0)}</span></div>
                                                <div className="flex justify-between text-destructive"><span>Fiado Salão:</span> <span className="font-mono">{formatCurrency(report.totalFiado)}</span></div>
                                                <div className="flex justify-between text-destructive"><span>Fiado Rua:</span> <span className="font-mono">{formatCurrency(0)}</span></div>
                                                 <Separator className="my-2" />
                                                <div className="flex justify-between"><span>Total Outros (O):</span> <span className="font-mono">{formatCurrency(report.totalBomboniere)}</span></div>
                                                <div className="flex justify-between"><span>Taxa p/ Motoboy:</span> <span className="font-mono">{formatCurrency(report.totalTaxas)}</span></div>
                                                <div className="flex justify-between"><span>Total de Entregas:</span> <span className="font-mono">{report.totalPedidos > 0 ? '1' : '0'}</span></div>
                                            </div>
                                        </div>
                                        {/* Contagem e Proporção */}
                                        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <h3 className="font-semibold text-center">Contagem de Itens</h3>
                                                <Separator/>
                                                {renderItemCounts(report)}
                                            </div>
                                            <div className="space-y-2">
                                                 <h3 className="font-semibold text-center">Proporção de Vendas</h3>
                                                 <Separator />
                                                 <ProportionChart report={report}/>
                                            </div>
                                        </div>
                                    </CardContent>
                                  </Card>
                               </AccordionContent>
                             </AccordionItem>
                           ))}
                         </Accordion>
                    </CardContent>
                </Card>
            )
        })}
        
        <Card>
            <CardHeader>
                <CardTitle>Gerenciamento de Dados</CardTitle>
                <CardDescription>Ações que afetam todo o histórico de vendas.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Limpar Histórico Completo
                </Button>
            </CardContent>
        </Card>
      </main>
    </div>
  );
}
