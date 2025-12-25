
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import type { Item, DailyReport } from '@/types';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
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
import { Loader2, ArrowLeft } from 'lucide-react';
import SummaryReport from '@/components/summary-report';
import FinalReport from '@/components/final-report';
import HistoryReportDetail from '@/components/history-report-detail';
import Link from 'next/link';

export default function HistoryPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [isOverwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
  const [pendingReport, setPendingReport] = useState<DailyReport | null>(null);

  const reportId = useMemo(() => {
    if (!selectedDate) return null;
    return format(selectedDate, 'yyyy-MM-dd');
  }, [selectedDate]);

  const handleGenerateReport = async () => {
    if (!firestore || !user || !selectedDate) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione uma data e tente novamente.' });
      return;
    }
    setIsLoading(true);
    setReport(null);

    try {
      const reportDate = format(selectedDate, 'yyyy-MM-dd');
      const reportDocId = `${user.uid}_${reportDate}`;
      const reportRef = doc(firestore, 'daily_reports', reportDocId);

      const startOfDay = new Date(new Date(selectedDate).setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(new Date(selectedDate).setHours(23, 59, 59, 999)).toISOString();
      
      const itemsQuery = query(
        collection(firestore, 'order_items'),
        where('userId', '==', user.uid),
        where('timestamp', '>=', startOfDay),
        where('timestamp', '<=', endOfDay)
      );

      const querySnapshot = await getDocs(itemsQuery);
      const items: Item[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item));

      if (items.length === 0) {
        toast({ title: 'Nenhum lançamento', description: `Não foram encontrados lançamentos para ${format(selectedDate, 'dd/MM/yyyy')}.` });
        setIsLoading(false);
        return;
      }

      let totalAVista = 0;
      let totalFiadoRua = 0;
      let totalFiadoSalao = 0;

      items.forEach(item => {
        if (item.group === 'Vendas salão' || item.group === 'Vendas rua') {
          totalAVista += item.total;
        } else if (item.group === 'Fiados rua') {
          totalFiadoRua += item.total;
        } else if (item.group === 'Fiados salão') {
          totalFiadoSalao += item.total;
        }
      });
      const total = totalAVista + totalFiadoRua + totalFiadoSalao;

      const newReportData: DailyReport = {
        id: reportDocId,
        userId: user.uid,
        totalAVista,
        totalFiadoRua,
        totalFiadoSalao,
        total,
        items,
      };

      const existingReportDoc = await getDoc(reportRef);

      if (existingReportDoc.exists()) {
        setPendingReport(newReportData);
        setOverwriteConfirmOpen(true);
      } else {
        await saveReport(newReportData);
      }

    } catch (error) {
      console.error('Error generating report:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível gerar o relatório.' });
      setIsLoading(false);
    }
  };
  
  const saveReport = async (reportToSave: DailyReport) => {
    if (!firestore) return;
    const reportRef = doc(firestore, 'daily_reports', reportToSave.id);
    await setDoc(reportRef, reportToSave);
    setReport(reportToSave);
    toast({ title: 'Relatório Gerado', description: 'O relatório foi processado com sucesso.' });
    setIsLoading(false);
  }

  const handleConfirmOverwrite = async () => {
    if (pendingReport) {
        await saveReport(pendingReport);
    }
    setOverwriteConfirmOpen(false);
    setPendingReport(null);
  }

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={isOverwriteConfirmOpen} onOpenChange={setOverwriteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir Relatório Existente?</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um relatório salvo para esta data. Deseja substituí-lo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setOverwriteConfirmOpen(false);
              setPendingReport(null);
              setIsLoading(false);
            }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOverwrite}>Substituir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="container mx-auto max-w-4xl p-4 lg:p-8 space-y-6">
        <header className="flex items-center gap-4">
           <Button variant="outline" size="icon" asChild>
              <Link href="/">
                  <ArrowLeft />
              </Link>
           </Button>
          <h1 className="text-2xl sm:text-3xl font-bold">Histórico de Vendas</h1>
        </header>
        
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="flex-grow">
              <DatePicker date={selectedDate} setDate={setSelectedDate} placeholder="Escolha uma data" />
            </div>
            <Button onClick={handleGenerateReport} disabled={isLoading || !selectedDate}>
              {isLoading && !isOverwriteConfirmOpen ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Gerar Relatório
            </Button>
          </CardContent>
        </Card>

        {isLoading && !isOverwriteConfirmOpen && (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">A gerar relatório...</p>
          </div>
        )}

        {report && (
          <div className="space-y-6">
            <SummaryReport items={report.items} />
            <FinalReport report={report} />
            <HistoryReportDetail items={report.items} />
          </div>
        )}
         {!report && !isLoading && (
           <div className="text-center text-muted-foreground py-10">
              <p>Selecione uma data e clique em "Gerar Relatório" para ver os dados do dia.</p>
           </div>
         )}
      </div>
    </>
  );
}
