
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, ArrowLeft, Save, FileDown, BrainCircuit } from 'lucide-react';
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"


import type { Item, DailyReport, ItemCount } from '@/types';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

export default function HistoryPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [isOverwriteAlertOpen, setOverwriteAlertOpen] = useState(false);
  const [reportToGenerate, setReportToGenerate] = useState<Omit<DailyReport, 'id' | 'userId' | 'createdAt'> | null>(null);
  
  const userOrderItemsQuery = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, "order_items"), where("userId", "==", user.uid)) : null),
    [firestore, user]
  );
  const { data: allItems, isLoading: isLoadingAllItems } = useCollection<Item>(userOrderItemsQuery);

  const dailyReportsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'daily_reports') : null), [firestore, user]);
  const { data: savedReports } = useCollection<DailyReport>(dailyReportsRef);
  
  const formattedDate = date ? format(date, 'yyyy-MM-dd') : null;
  const isReportSavedForDate = formattedDate ? savedReports?.some(report => report.id === formattedDate) : false;

  useEffect(() => {
    if (date && allItems) {
      setIsLoading(true);
      const start = startOfDay(date);
      const end = endOfDay(date);
      
      const filteredItems = allItems.filter(item => {
          try {
              if (!item.timestamp) return false;
              const itemDate = new Date(item.timestamp);
              return isWithinInterval(itemDate, { start, end });
          } catch(e) {
              return false;
          }
      });
      
      setItems(filteredItems);
      setIsLoading(false);
    } else if (!allItems) {
      setIsLoading(isLoadingAllItems);
    }
  }, [date, allItems, isLoadingAllItems]);


  const reportData = useMemo(() => {
    let totalVendasSalao = 0;
    let totalVendasRua = 0;
    let totalFiadoSalao = 0;
    let totalFiadoRua = 0;
    let totalOutros = 0;
    let totalKgValue = 0;
    let totalTaxas = 0;
    let totalEntregas = 0;
    let totalGeralItens = 0;
    let totalItensRua = 0;
    let contagemTotal: ItemCount = {};
    let contagemRua: ItemCount = {};

    items.forEach(item => {
      const group = item.group || '';
      
      // Totals
      if (group === 'Vendas salão') totalVendasSalao += item.total || 0;
      else if (group === 'Vendas rua') totalVendasRua += item.total || 0;
      else if (group === 'Fiados salão') totalFiadoSalao += item.total || 0;
      else if (group === 'Fiados rua') totalFiadoRua += item.total || 0;

      totalTaxas += item.deliveryFee || 0;
      if (item.deliveryFee > 0) totalEntregas += 1;

      // Item Counts
      const processItemCounts = (itemSource: { name: string }[], isRua: boolean) => {
        itemSource.forEach(p => {
          const name = p.name;
          contagemTotal[name] = (contagemTotal[name] || 0) + 1;
          totalGeralItens += 1;
          if (isRua) {
            contagemRua[name] = (contagemRua[name] || 0) + 1;
            totalItensRua += 1;
          }
        });
      };
      
      if (item.predefinedItems) {
        processItemCounts(item.predefinedItems, group.includes('rua'));
      }
      
      if (item.bomboniereItems) {
        item.bomboniereItems.forEach(b => {
          totalOutros += b.price * b.quantity;
        })
      }

      if (item.individualPrices) {
        item.individualPrices.forEach(price => {
          totalKgValue += price;
        });
      }
    });

    const faturamentoTotal = totalVendasSalao + totalVendasRua + totalFiadoSalao + totalFiadoRua;

    return {
      faturamentoTotal,
      totalVendasSalao,
      totalVendasRua,
      totalFiadoSalao,
      totalFiadoRua,
      totalOutros,
      totalKg: totalKgValue,
      totalTaxas,
      totalEntregas,
      totalGeralItens,
      totalItensRua,
      contagemTotal,
      contagemRua
    };
  }, [items]);


  const handleGenerateReport = async () => {
    if (!firestore || !user || !date || items.length === 0) {
      toast({ variant: 'destructive', title: 'Não é possível gerar o relatório', description: 'Selecione uma data com lançamentos.' });
      return;
    }
    
    const reportDate = format(date, 'yyyy-MM-dd');
    
    const newReportData = {
      totalAVista: reportData.totalVendasSalao + reportData.totalVendasRua,
      totalFiado: reportData.totalFiadoSalao + reportData.totalFiadoRua,
      totalGeral: reportData.faturamentoTotal,
      totalMarmitas: 0, // This needs recalculation if still relevant
      totalKg: reportData.totalKg,
      totalBomboniere: reportData.totalOutros,
      totalTaxas: reportData.totalTaxas,
      totalItens: reportData.totalGeralItens,
      totalPedidos: items.length,
      // Include new detailed fields
      totalVendasSalao: reportData.totalVendasSalao,
      totalVendasRua: reportData.totalVendasRua,
      totalFiadoSalao: reportData.totalFiadoSalao,
      totalFiadoRua: reportData.totalFiadoRua,
      totalEntregas: reportData.totalEntregas,
      totalItensRua: reportData.totalItensRua,
      contagemTotal: reportData.contagemTotal,
      contagemRua: reportData.contagemRua,
    };
    
    setReportToGenerate(newReportData);

    try {
      const reportRef = doc(firestore, 'daily_reports', reportDate);
      const docSnap = await getDoc(reportRef);

      if (docSnap.exists()) {
        setOverwriteAlertOpen(true);
      } else {
        await confirmGenerateReport(newReportData);
      }
    } catch (error) {
      console.error("Error checking for existing report:", error);
      toast({ variant: "destructive", title: "Erro ao verificar relatório." });
    }
  };
  
  const confirmGenerateReport = async (reportDataToSave: Omit<DailyReport, 'id' | 'userId' | 'createdAt'> | null) => {
    if (!firestore || !user || !date || !reportDataToSave) return;
    
    setIsGenerating(true);
    try {
      const reportDate = format(date, 'yyyy-MM-dd');
      const finalReport: DailyReport = {
        id: reportDate,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        ...reportDataToSave
      }
      
      const reportRef = doc(firestore, 'daily_reports', reportDate);
      await setDoc(reportRef, finalReport, { merge: true });
      toast({ title: 'Sucesso', description: 'Relatório final salvo!' });
    } catch (error) {
      console.error('Error saving daily report: ', error);
      toast({ variant: 'destructive', title: 'Erro ao salvar relatório.' });
    } finally {
      setIsGenerating(false);
      setReportToGenerate(null);
      setOverwriteAlertOpen(false);
    }
  };

  const chartData = [
      { name: 'Vendas Salão', value: reportData.totalVendasSalao, fill: 'hsl(var(--primary))' },
      { name: 'Vendas Rua', value: reportData.totalVendasRua, fill: 'hsl(var(--chart-2))' },
      { name: 'Fiado Salão', value: reportData.totalFiadoSalao, fill: 'hsl(var(--chart-3))' },
      { name: 'Fiado Rua', value: reportData.totalFiadoRua, fill: 'hsl(var(--chart-5))' },
  ];

  const chartConfig = {
      "Vendas Salão": { label: "Vendas Salão", color: "hsl(var(--primary))" },
      "Vendas Rua": { label: "Vendas Rua", color: "hsl(var(--chart-2))" },
      "Fiado Salão": { label: "Fiado Salão", color: "hsl(var(--chart-3))" },
      "Fiado Rua": { label: "Fiado Rua", color: "hsl(var(--chart-5))" },
  };

  const renderItemCountList = (counts: ItemCount) => (
    <ul className="text-xs space-y-0.5">
        {Object.entries(counts)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, count]) => (
                <li key={name} className="flex justify-between">
                    <span>• {name}:</span>
                    <span className="font-bold">{count}</span>
                </li>
            ))}
    </ul>
  );

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={isOverwriteAlertOpen} onOpenChange={setOverwriteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir Relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um relatório salvo para esta data. Deseja substituí-lo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReportToGenerate(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmGenerateReport(reportToGenerate)}>Substituir</AlertDialogAction>
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
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatório do Dia</h1>
              <p className="text-muted-foreground">{date ? format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'Selecione uma data'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DatePicker date={date} setDate={setDate} />
            <Button 
              onClick={handleGenerateReport} 
              disabled={isGenerating || isLoading || items.length === 0}
            >
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isReportSavedForDate ? 'Salvar Novamente' : 'Salvar Relatório Final'}
            </Button>
          </div>
        </header>

        <main className="space-y-6">
          {isLoading ? (
            <div className="text-center p-10"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></div>
          ) : items.length > 0 ? (
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle className="text-lg">Resumo do Dia - FATURAMENTO</CardTitle>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-bold text-primary">{formatCurrency(reportData.faturamentoTotal)}</p>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-2">Resumo Financeiro</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between items-center"><span className="text-primary">Vendas Salão:</span> <span className="font-mono">{formatCurrency(reportData.totalVendasSalao)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-primary">Vendas Rua:</span> <span className="font-mono">{formatCurrency(reportData.totalVendasRua)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-destructive">Fiado Salão:</span> <span className="font-mono">{formatCurrency(reportData.totalFiadoSalao)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-destructive">Fiado Rua:</span> <span className="font-mono">{formatCurrency(reportData.totalFiadoRua)}</span></div>
                      </div>
                    </div>
                    <Separator/>
                     <div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between items-center"><span>Total Outros (O):</span> <span className="font-mono">{formatCurrency(reportData.totalOutros)}</span></div>
                        <div className="flex justify-between items-center"><span>Total KG:</span> <span className="font-mono">{formatCurrency(reportData.totalKg)}</span></div>
                        <div className="flex justify-between items-center"><span>Taxa p/ Motoboy:</span> <span className="font-mono">{formatCurrency(reportData.totalTaxas)}</span></div>
                      </div>
                    </div>
                    <Separator/>
                     <div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between items-center text-muted-foreground"><span>Total de Entregas:</span> <span className="font-mono font-bold text-foreground">{reportData.totalEntregas}</span></div>
                        <div className="flex justify-between items-center text-muted-foreground"><span>Total Geral (Itens):</span> <span className="font-mono font-bold text-foreground">{reportData.totalGeralItens}</span></div>
                        <div className="flex justify-between items-center text-muted-foreground"><span>Total Itens (Rua):</span> <span className="font-mono font-bold text-foreground">{reportData.totalItensRua}</span></div>
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
                                {renderItemCountList(reportData.contagemTotal)}
                            </div>
                            <div>
                                <h4 className="font-medium text-xs text-muted-foreground mb-1">Rua</h4>
                                {renderItemCountList(reportData.contagemRua)}
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

            </div>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <p>Nenhum lançamento encontrado para a data selecionada.</p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </>
  );
}
