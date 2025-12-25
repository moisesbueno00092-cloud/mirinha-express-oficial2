
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
import { Loader2, ArrowLeft, Trash2, Edit, ArrowUpCircle, BrainCircuit, FileDown } from 'lucide-react';
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
import type { DailyReport, ItemCount } from '@/types';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp-icon';


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
      { name: 'Vendas Salão', value: report.totalVendasSalao || 0, fill: 'hsl(var(--primary))' },
      { name: 'Vendas Rua', value: report.totalVendasRua || 0, fill: 'hsl(var(--chart-2))' },
      { name: 'Fiado Salão', value: report.totalFiadoSalao || 0, fill: 'hsl(var(--chart-3))' },
      { name: 'Fiado Rua', value: report.totalFiadoRua || 0, fill: 'hsl(var(--chart-5))' },
    ];
    const chartConfig = {
      "Vendas Salão": { label: "Vendas Salão", color: "hsl(var(--primary))" },
      "Vendas Rua": { label: "Vendas Rua", color: "hsl(var(--chart-2))" },
      "Fiado Salão": { label: "Fiado Salão", color: "hsl(var(--chart-3))" },
      "Fiado Rua": { label: "Fiado Rua", color: "hsl(var(--chart-5))" },
    };
  
    // Do not render the chart if there is no data
    if (chartData.every(d => d.value === 0)) {
        return (
            <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground">
                Sem dados para o gráfico.
            </div>
        );
    }
  
    return (
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-[180px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel formatter={(value, name, item) => (
                  <div className="flex flex-col">
                      <span>{item.payload.name}</span>
                      <span className="font-bold">{formatCurrency(value as number)}</span>
                  </div>
              )} />}
            />
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={40} strokeWidth={2}>
            {chartData.map((entry) => (
                <Cell key={`cell-${entry.name}`} fill={entry.fill} />
            ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
    );
  };
  
  const renderItemCountList = (counts?: ItemCount) => (
    <ul className="text-xs space-y-0.5">
        {!counts || Object.keys(counts).length === 0 ? (
            <li className="text-muted-foreground">Nenhum</li>
        ) : (
        Object.entries(counts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, count]) => (
                <li key={name} className="flex justify-between">
                    <span>• {name}:</span>
                    <span className="font-bold">{count}</span>
                </li>
            ))
        )}
    </ul>
  );


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
      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
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
                                         <div className="flex items-center gap-4">
                                            <p className="text-lg font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
                                            <div className="flex items-center">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); toast({ variant: 'destructive', title: 'Em breve', description: 'A edição de relatórios será implementada no futuro.'}) }}>
                                                  <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteRequest(report.id); }}>
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                         </div>
                                    </div>
                                 </AccordionTrigger>
                                 <AccordionContent className="p-2">
                                    <Card className="bg-card/50 shadow-inner">
                                        <CardHeader className="flex flex-row items-start justify-between">
                                            <div>
                                                <CardTitle className="text-lg">Resumo do Dia - FATURAMENTO</CardTitle>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-3xl font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
                                            </div>
                                        </CardHeader>
                                      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                          {/* Left Column */}
                                          <div className="space-y-4">
                                            <div>
                                              <h3 className="font-semibold mb-2">Resumo Financeiro</h3>
                                              <div className="space-y-1 text-sm">
                                                <div className="flex justify-between items-center"><span className="text-primary">Vendas Salão:</span> <span className="font-mono">{formatCurrency(report.totalVendasSalao)}</span></div>
                                                <div className="flex justify-between items-center"><span className="text-primary">Vendas Rua:</span> <span className="font-mono">{formatCurrency(report.totalVendasRua)}</span></div>
                                                <div className="flex justify-between items-center"><span className="text-destructive">Fiado Salão:</span> <span className="font-mono">{formatCurrency(report.totalFiadoSalao)}</span></div>
                                                <div className="flex justify-between items-center"><span className="text-destructive">Fiado Rua:</span> <span className="font-mono">{formatCurrency(report.totalFiadoRua)}</span></div>
                                              </div>
                                            </div>
                                            <Separator/>
                                            <div>
                                              <div className="space-y-1 text-sm">
                                                <div className="flex justify-between items-center"><span>Total Outros (O):</span> <span className="font-mono">{formatCurrency(report.totalBomboniere)}</span></div>
                                                <div className="flex justify-between items-center"><span>Total KG:</span> <span className="font-mono">{formatCurrency(report.totalKg)}</span></div>
                                                <div className="flex justify-between items-center"><span>Taxa p/ Motoboy:</span> <span className="font-mono">{formatCurrency(report.totalTaxas)}</span></div>
                                              </div>
                                            </div>
                                            <Separator/>
                                            <div>
                                              <div className="space-y-1 text-sm">
                                                <div className="flex justify-between items-center text-muted-foreground"><span>Total de Entregas:</span> <span className="font-mono font-bold text-foreground">{report.totalEntregas || 0}</span></div>
                                                <div className="flex justify-between items-center text-muted-foreground"><span>Total Geral (Itens):</span> <span className="font-mono font-bold text-foreground">{report.totalItens || 0}</span></div>
                                                <div className="flex justify-between items-center text-muted-foreground"><span>Total Itens (Rua):</span> <span className="font-mono font-bold text-foreground">{report.totalItensRua || 0}</span></div>
                                              </div>
                                            </div>
                                          </div>
                                          {/* Right Column */}
                                          <div className="space-y-4">
                                            <div>
                                                <h3 className="font-semibold mb-2">Contagem de Itens</h3>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <h4 className="font-medium text-xs text-muted-foreground mb-1">Total</h4>
                                                        {renderItemCountList(report.contagemTotal)}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium text-xs text-muted-foreground mb-1">Rua</h4>
                                                        {renderItemCountList(report.contagemRua)}
                                                    </div>
                                                </div>
                                            </div>
                                            <Separator />
                                            <div>
                                                <h3 className="font-semibold mb-2">Proporção de Vendas</h3>
                                                <ProportionChart report={report}/>
                                            </div>
                                          </div>
                                      </CardContent>
                                      <CardContent>
                                        <Separator className="mb-4" />
                                        <h3 className="font-semibold mb-3">Ações</h3>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => toast({ title: 'Em breve!'})} className="flex-1 sm:flex-none">
                                                <WhatsAppIcon className="mr-2 h-4 w-4" />
                                                Enviar via WhatsApp
                                            </Button>
                                            <Button variant="outline" onClick={() => toast({ title: 'Em breve!'})} className="flex-1 sm:flex-none">
                                                <FileDown className="mr-2 h-4 w-4" />
                                                Exportar para WPS
                                            </Button>
                                            <Button variant="outline" onClick={() => toast({ title: 'Em breve!'})} className="flex-1 sm:flex-none">
                                                <BrainCircuit className="mr-2 h-4 w-4" />
                                                Analisar com IA
                                            </Button>
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

    