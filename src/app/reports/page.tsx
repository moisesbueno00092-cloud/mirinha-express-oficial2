
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
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
import { useToast } from '@/hooks/use-toast';


import type { DailyReport } from '@/types';


const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const getDayName = (date: Date) => {
    return format(date, 'EEEE', { locale: ptBR });
}

export default function ReportsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      { name: 'Vendas', value: report.totalAVista || 0, fill: 'hsl(var(--chart-1))' },
      { name: 'Fiado', value: report.totalFiado || 0, fill: 'hsl(var(--destructive))' },
    ];
    const chartConfig = {
      vendas: { label: "Vendas", color: "hsl(var(--chart-1))" },
      fiado: { label: "Fiado", color: "hsl(var(--destructive))" },
    };

    // Do not render the chart if there is no data
    if (chartData.every(d => d.value === 0)) {
        return (
            <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
                Sem dados para o gráfico.
            </div>
        );
    }


    return (
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-[150px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel formatter={(value) => formatCurrency(value as number)} />}
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
        totalMarmitas: report.totalMarmitas || 0,
        totalKg: report.totalKg || 0,
        totalBomboniere: report.totalBomboniere || 0,
    };
    
    return (
        <div className="grid grid-cols-1 gap-4 text-sm">
            <div>
                <h4 className="font-semibold mb-1">Contagem de Itens</h4>
                <Separator/>
                <ul className="mt-2 space-y-1">
                    {counts.totalMarmitas > 0 && <li className="flex justify-between"><span>Marmitas:</span> <span>{counts.totalMarmitas}</span></li>}
                    {counts.totalKg > 0 && <li className="flex justify-between"><span>KG:</span> <span>{counts.totalKg}</span></li>}
                    {counts.totalBomboniere > 0 && <li className="flex justify-between"><span>Bomboniere:</span> <span>{counts.totalBomboniere}</span></li>}
                    {(counts.totalMarmitas === 0 && counts.totalKg === 0 && counts.totalBomboniere === 0) && <li className="text-muted-foreground">Nenhum item contado.</li>}
                </ul>
            </div>
        </div>
    )
  }

  const handleDeleteRequest = (reportId: string) => {
    setReportToDelete(reportId);
  };

  const confirmDelete = async () => {
    if (!firestore || !reportToDelete) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, "daily_reports", reportToDelete));
      toast({ title: 'Sucesso', description: 'Relatório excluído.' });
    } catch (error) {
      console.error("Error deleting report:", error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível excluir o relatório.' });
    } finally {
      setIsDeleting(false);
      setReportToDelete(null);
    }
  };


  if (isUserLoading || isLoadingReports) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={!!reportToDelete} onOpenChange={setReportToDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita e excluirá permanentemente o relatório diário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          {monthInterval.slice().reverse().map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const dayReports = reportsByDay[dateStr] || [];
              if (dayReports.length === 0) return null;

              const totalDia = dayReports.reduce((sum, report) => sum + (report.totalGeral || 0), 0);

              return (
                  <Card key={dateStr}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
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
                      <CardContent className="pt-0">
                           <Accordion type="single" collapsible className="w-full">
                             {dayReports.map((report, index) => (
                               <AccordionItem value={`item-${report.id}-${index}`} key={`${report.id}-${index}`}>
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
                                    <Card className="bg-card/50 shadow-inner">
                                      <CardHeader>
                                        <div className="flex justify-between items-start">
                                          <div>
                                              <CardTitle className="text-lg">Detalhes do Relatório #{index + 1}</CardTitle>
                                              <CardDescription>Faturamento Total: {formatCurrency(report.totalGeral)}</CardDescription>
                                          </div>
                                          <div className="flex items-center -mt-2">
                                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); toast({ variant: 'destructive', title: 'Em breve', description: 'A edição de relatórios será implementada no futuro.'}) }}>
                                                <Edit className="h-4 w-4" />
                                              </Button>
                                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteRequest(report.id); }}>
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                          </div>
                                        </div>
                                      </CardHeader>
                                      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                          <div className="md:col-span-1 space-y-2">
                                              <h3 className="font-semibold text-center md:text-left">Resumo Financeiro</h3>
                                               <Separator />
                                              <div className="space-y-1 text-sm">
                                                  <div className="flex justify-between"><span>À Vista:</span> <span className="font-mono">{formatCurrency(report.totalAVista)}</span></div>
                                                  <div className="flex justify-between text-destructive"><span>Fiado:</span> <span className="font-mono">{formatCurrency(report.totalFiado)}</span></div>
                                                  <Separator className="my-2" />
                                                  <div className="flex justify-between"><span>Taxa Motoboy:</span> <span className="font-mono">{formatCurrency(report.totalTaxas)}</span></div>
                                                  <div className="flex justify-between"><span>Total Itens:</span> <span className="font-mono">{report.totalItens || 0}</span></div>
                                                  <div className="flex justify-between"><span>Total Pedidos:</span> <span className="font-mono">{report.totalPedidos || 0}</span></div>
                                              </div>
                                          </div>
                                          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                              <div className="space-y-2">
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
          
          {(savedReports === null || savedReports.length === 0) && (
            <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                    <p>Nenhum relatório salvo encontrado para o mês selecionado.</p>
                </CardContent>
            </Card>
          )}

          <Card>
              <CardHeader>
                  <CardTitle>Gerenciamento de Dados</CardTitle>
                  <CardDescription>Ações que afetam todo o histórico de vendas.</CardDescription>
              </CardHeader>
              <CardContent>
                  <Button variant="destructive" onClick={() => toast({ variant: 'destructive', title: 'Em breve', description: 'A limpeza completa do histórico será implementada no futuro.'})}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpar Histórico Completo
                  </Button>
              </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
}
