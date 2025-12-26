
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp-icon';
import { useToast } from '@/hooks/use-toast';
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

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

export default function ReportsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const dailyReportsRef = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'daily_reports'), orderBy('reportDate', 'desc')) : null), [firestore, user]);
  const { data: savedReports, isLoading: isLoadingReports } = useCollection<DailyReport>(dailyReportsRef);

  const renderItemCountList = (counts: ItemCount) => (
    <ul className="text-xs space-y-0.5">
        {Object.entries(counts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, count]) => (
                <li key={name} className="flex justify-between">
                    <span>• {name}:</span>
                    <span className="font-bold">{count}</span>
                </li>
            ))}
    </ul>
  );
  
  const renderReportDetail = (report: DailyReport) => {
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
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                  <div className="flex justify-between items-center"><span>Bomboniere:</span> <span className="font-mono">{formatCurrency(report.totalBomboniere)}</span></div>
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

            <div className="space-y-4">
               <div>
                  <h3 className="font-semibold mb-2">Contagem de Itens</h3>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <h4 className="font-medium text-xs text-muted-foreground mb-1">Salão</h4>
                          {renderItemCountList(report.contagemTotal || {})}
                      </div>
                      <div>
                          <h4 className="font-medium text-xs text-muted-foreground mb-1">Rua</h4>
                          {renderItemCountList(report.contagemRua || {})}
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
          </CardContent>
      </Card>
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
                <AccordionTrigger>
                  <div className="flex justify-between w-full pr-4">
                    <span className="font-semibold text-lg">
                      {format(new Date(report.reportDate + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                    <span className="text-primary font-bold text-lg">
                      {formatCurrency(report.totalGeral)}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-2">
                  {renderReportDetail(report)}
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
  );
}
