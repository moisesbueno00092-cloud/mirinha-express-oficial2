
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, ArrowLeft } from 'lucide-react';
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

import type { Item, DailyReport } from '@/types';

import SummaryReport from '@/components/summary-report';
import FinalReport from '@/components/final-report';
import HistoryReportDetail from '@/components/history-report-detail';

export default function HistoryPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [isOverwriteAlertOpen, setOverwriteAlertOpen] = useState(false);
  const [reportToGenerate, setReportToGenerate] = useState<DailyReport | null>(null);
  
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


  const handleGenerateReport = async () => {
    if (!firestore || !user || !date || items.length === 0) {
      toast({ variant: 'destructive', title: 'Não é possível gerar o relatório', description: 'Selecione uma data com lançamentos.' });
      return;
    }
    
    setIsGenerating(true);

    const reportDate = format(date, 'yyyy-MM-dd');
    
    const newReport: DailyReport = {
      id: reportDate,
      userId: user.uid,
      totalAVista: reportData.totalAVista,
      totalFiado: reportData.totalFiado,
      totalGeral: reportData.totalGeral,
      totalMarmitas: reportData.totalMarmitas,
      totalKg: reportData.totalKg,
      totalBomboniere: reportData.totalBomboniere,
      totalTaxas: reportData.totalTaxas,
      totalItens: reportData.totalItens,
      totalPedidos: items.length,
      createdAt: new Date().toISOString()
    };
    
    setReportToGenerate(newReport);

    try {
      const reportRef = doc(firestore, 'daily_reports', reportDate);
      const docSnap = await getDoc(reportRef);

      if (docSnap.exists()) {
        setOverwriteAlertOpen(true);
      } else {
        await confirmGenerateReport(newReport);
      }
    } catch (error) {
      console.error("Error checking for existing report:", error);
      toast({ variant: "destructive", title: "Erro ao verificar relatório." });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const confirmGenerateReport = async (reportToSave: DailyReport | null) => {
    if (!firestore || !reportToSave) return;
    
    setIsGenerating(true);
    try {
      const reportRef = doc(firestore, 'daily_reports', reportToSave.id);
      await setDoc(reportRef, reportToSave);
      toast({ title: 'Sucesso', description: 'Relatório diário salvo!' });
    } catch (error) {
      console.error('Error saving daily report: ', error);
      toast({ variant: 'destructive', title: 'Erro ao salvar relatório.' });
    } finally {
      setIsGenerating(false);
      setReportToGenerate(null);
      setOverwriteAlertOpen(false);
    }
  };

  const reportData = useMemo(() => {
    let totalAVista = 0;
    let totalFiado = 0;
    let totalMarmitas = 0;
    let totalKg = 0;
    let totalBomboniere = 0;
    let totalTaxas = 0;
    let totalItens = 0;

    items.forEach(item => {
      if (item.group.includes('Fiados')) {
        totalFiado += item.total;
      } else {
        totalAVista += item.total;
      }
      
      totalTaxas += item.deliveryFee;

      if (item.predefinedItems) {
          const marmitasCount = item.predefinedItems.filter(p => !['S', 'SL', 'SLKIT'].includes(p.name)).length;
          totalMarmitas += marmitasCount;
      }
      if (item.individualPrices) {
        totalKg += item.individualPrices.length;
      }
      if (item.bomboniereItems) {
        totalBomboniere += item.bomboniereItems.reduce((acc, bi) => acc + bi.quantity, 0);
      }
      totalItens += item.quantity;
    });

    return {
      totalAVista,
      totalFiado,
      totalGeral: totalAVista + totalFiado,
      totalMarmitas,
      totalKg,
      totalBomboniere,
      totalTaxas,
      totalItens,
      totalPedidos: items.length,
    };
  }, [items]);


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

      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Histórico de Vendas</h1>
          </div>
        </header>

        <main className="space-y-6">
          <Card>
            <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center">
              <div className="w-full sm:w-auto">
                <DatePicker date={date} setDate={setDate} placeholder="Selecione uma data" />
              </div>
              <Button 
                onClick={handleGenerateReport} 
                disabled={isGenerating || isLoading || items.length === 0}
                className="w-full sm:w-auto"
              >
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isReportSavedForDate ? 'Salvar Novamente' : 'Salvar Relatório do Dia'}
              </Button>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="text-center p-10"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></div>
          ) : items.length > 0 ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SummaryReport report={reportData} />
                <FinalReport report={reportData} />
              </div>
              <HistoryReportDetail items={items} />
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
