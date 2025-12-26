
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp-icon';
import { useToast } from '@/hooks/use-toast';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"

import type { DailyReport, ItemCount } from '@/types';
import DailyTimelineChart from '@/components/daily-timeline-chart';
import { BOMBONIERE_ITEMS_DEFAULT } from '@/lib/constants';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const bomboniereNames = new Set(BOMBONIERE_ITEMS_DEFAULT.map(item => item.name.toLowerCase()));

const isBomboniere = (itemName: string): boolean => {
    const lowerItemName = itemName.toLowerCase();
    const bomboniereItemDef = BOMBONIERE_ITEMS_DEFAULT.find(bi => bi.name.toLowerCase().replace(/\s+/g, '-') === lowerItemName);
    return !!bomboniereItemDef || bomboniereNames.has(lowerItemName) || /^\d+[a-zA-Z]+/.test(lowerItemName) || lowerItemName.includes('bala') || lowerItemName.includes('chiclete') || lowerItemName.includes('chocolate');
};

const separateItemsByCategory = (itemCount: ItemCount) => {
    const lanches: ItemCount = {};
    const bomboniere: ItemCount = {};
    if (!itemCount) return { lanches, bomboniere };
    for (const [name, count] of Object.entries(itemCount)) {
        if (isBomboniere(name)) {
            bomboniere[name] = (bomboniere[name] || 0) + count;
        } else {
            lanches[name] = (lanches[name] || 0) + count;
        }
    }
    return { lanches, bomboniere };
};

const renderItemCountList = (counts: ItemCount, title?: string) => {
  if (!counts || Object.keys(counts).length === 0) {
    return null;
  }

  const sortedEntries = Object.entries(counts)
    .sort(([, aCount], [, bCount]) => bCount - aCount);

  if (sortedEntries.length === 0) {
    return null;
  }

  return (
    <div className={title ? 'mt-3' : ''}>
      {title && <h5 className="font-medium text-xs text-muted-foreground mb-2">{title}</h5>}
      <ul className="text-xs space-y-0.5">
        {sortedEntries.map(([name, count]) => (
            <li key={name} className="flex items-center gap-2">
              <span className="font-bold w-6 text-right">{count}</span>
              <span>{name}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

const ReportDetail = ({ report }: { report: DailyReport }) => {
    const chartData = [
        { name: 'Vendas Salão', value: report.totalVendasSalao, fill: 'hsl(var(--primary))' },
        { name: 'Vendas Rua', value: report.totalVendasRua, fill: 'hsl(var(--chart-2))' },
        { name: 'Fiado Salão', value: report.totalFiadoSalao, fill: 'hsl(var(--chart-3))' },
        { name: 'Fiado Rua', value: report.totalFiadoRua, fill: 'hsl(var(--chart-5))' },
    ];

    const chartConfig = {
        "Vendas Salão": { label: "Vendas Salão", color: "hsl(var(--primary))" },
        "Vendas Rua": { label: "Vendas Rua", color: "hsl(var(--chart-2))" },
        "Fiado Salão": { label: "Fiado Salão", color: "hsl(var(--chart-3))" },
        "Fiado Rua": { label: "Fiado Rua", color: "hsl(var(--chart-5))" },
    };

    const { lanchesSalao, bomboniereSalao, lanchesRua, bomboniereRua } = useMemo(() => {
        const contagemSalao: ItemCount = {};
        if (report.contagemTotal && report.contagemRua) {
            for (const key in report.contagemTotal) {
                const totalCount = report.contagemTotal[key] || 0;
                const ruaCount = report.contagemRua[key] || 0;
                const salaoCount = totalCount - ruaCount;
                if (salaoCount > 0) {
                    contagemSalao[key] = salaoCount;
                }
            }
        }

        const { lanches: lanchesSalao, bomboniere: bomboniereSalao } = separateItemsByCategory(contagemSalao);
        const { lanches: lanchesRua, bomboniere: bomboniereRua } = separateItemsByCategory(report.contagemRua);
        
        return { lanchesSalao, bomboniereSalao, lanchesRua, bomboniereRua };
    }, [report.contagemTotal, report.contagemRua]);


  return (
    <Card>
        <CardHeader className="flex flex-row items-start justify-between">
            <div>
                <CardTitle className="text-lg">Resumo do Dia - FATURAMENTO</CardTitle>
            </div>
            <div className="text-right">
                <p className="text-3xl font-bold text-primary">{formatCurrency(report.totalGeral)}</p>
            </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                  <div className="flex justify-between items-center"><span>Bomboniere Salão:</span> <span className="font-mono">{formatCurrency(report.totalBomboniereSalao)}</span></div>
                  <div className="flex justify-between items-center"><span>Bomboniere Rua:</span> <span className="font-mono">{formatCurrency(report.totalBomboniereRua)}</span></div>
                  <div className="flex justify-between items-center"><span>Total KG:</span> <span className="font-mono">{formatCurrency(report.totalKg)}</span></div>
                </div>
              </div>
              <Separator/>
              <div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center text-muted-foreground"><span>Total Entregas:</span> <span className="font-mono font-bold text-foreground">{report.totalEntregas || 0} ({formatCurrency(report.totalTaxas)})</span></div>
                  <div className="flex justify-between items-center text-muted-foreground"><span>Total Geral (Itens):</span> <span className="font-mono font-bold text-foreground">{report.totalItens || 0}</span></div>
                  <div className="flex justify-between items-center text-muted-foreground"><span>Total Itens (Rua):</span> <span className="font-mono font-bold text-foreground">{report.totalItensRua || 0}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                  <h3 className="font-semibold mb-2">Contagem de Itens</h3>
                  <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-medium text-xs text-muted-foreground mb-1">Salão</h4>
                            {renderItemCountList(lanchesSalao)}
                            {renderItemCountList(bomboniereSalao, "Bomboniere")}
                        </div>
                        <div>
                            <h4 className="font-medium text-xs text-muted-foreground mb-1">Rua</h4>
                            {renderItemCountList(lanchesRua)}
                            {renderItemCountList(bomboniereRua, "Bomboniere")}
                        </div>
                  </div>
              </div>
              <Separator />
              <div>
                  <h3 className="font-semibold mb-2">Proporção de Vendas</h3>
                  <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[180px]">
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
              </div>
            </div>
          </div>
          {report.items && report.items.length > 0 && (
            <>
              <Separator />
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                 <DailyTimelineChart items={report.items} dataType="total" title="Picos de Vendas (Valor)" color="primary" />
                 <DailyTimelineChart items={report.items} dataType="quantity" title="Picos de Vendas (Quantidade)" color="chart-2" />
              </div>
            </>
          )}
        </CardContent>
    </Card>
  )
}

export default function ReportsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const dailyReportsRef = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'daily_reports'), orderBy('reportDate', 'desc')) : null), [firestore, user]);
  const { data: savedReports, isLoading: isLoadingReports } = useCollection<DailyReport>(dailyReportsRef);
  
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const handleDeleteReportRequest = (reportId: string) => {
    setReportToDelete(reportId);
  };

  const confirmDeleteReport = async () => {
    if (!firestore || !reportToDelete) return;
    try {
      await deleteDoc(doc(firestore, "daily_reports", reportToDelete));
      toast({
        title: "Sucesso",
        description: "Relatório excluído permanentemente.",
      });
    } catch (error) {
      console.error("Error deleting report:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível excluir o relatório.",
      });
    } finally {
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
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o relatório selecionado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReport}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="container mx-auto max-w-5xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatórios Salvos</h1>
              <p className="text-muted-foreground">Histórico de relatórios diários finalizados.</p>
            </div>
          </div>
        </header>

        <main className="space-y-2">
          {savedReports && savedReports.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {savedReports.map(report => (
                <AccordionItem value={report.id} key={report.id}>
                  <div className="flex w-full items-center" >
                    <AccordionTrigger className="flex-1 py-4 pr-2 hover:no-underline">
                        <span className="font-semibold text-lg">
                            {format(new Date(report.reportDate + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </span>
                    </AccordionTrigger>
                    <div className="flex-grow" />
                    <span className="font-bold text-lg text-primary text-right px-4">
                        {formatCurrency(report.totalGeral)}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive ml-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteReportRequest(report.id);
                        }}
                        >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <AccordionContent className="p-2 pt-0">
                    <ReportDetail report={report} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <p>Nenhum relatório salvo encontrado.</p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </>
  );
}
