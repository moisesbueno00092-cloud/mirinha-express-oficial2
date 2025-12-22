
'use client';

import { useState, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import type { DailyReport } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import HistoryReportDetail from '@/components/history-report-detail';
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
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from "@/hooks/use-toast";


export default function HistoryPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const reportsRef = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'daily_reports'), orderBy('timestamp', 'desc')) : null),
    [firestore]
  );
  const { data: reports, isLoading, error } = useCollection<DailyReport>(reportsRef);
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };
  
  const handleDeleteRequest = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent card click event
    setReportToDelete(id);
  };
  
  const confirmDelete = () => {
    if (!firestore || !reportToDelete) return;
    
    const docRef = doc(firestore, "daily_reports", reportToDelete);
    deleteDocumentNonBlocking(docRef);

    toast({
      title: "Relatório Excluído",
      description: "O relatório foi removido permanentemente.",
    });

    // If the deleted report was the one being detailed, go back to list
    if(selectedReport?.id === reportToDelete) {
        setSelectedReport(null);
    }

    setReportToDelete(null);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto max-w-4xl p-8 text-center text-destructive">
        <h1 className="text-2xl font-bold">Erro ao Carregar Histórico</h1>
        <p>Não foi possível buscar os relatórios salvos.</p>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
        <Link href="/" passHref>
            <Button variant="outline" className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
            </Button>
        </Link>
      </div>
    );
  }

  if (selectedReport) {
    return (
      <HistoryReportDetail 
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
        onDelete={() => handleDeleteRequest(selectedReport.id)}
      />
    )
  }

  return (
    <>
      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o relatório selecionado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="container mx-auto max-w-4xl p-4 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">Histórico de Relatórios</h1>
          <Link href="/" passHref>
              <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
              </Button>
          </Link>
        </div>

        {reports && reports.length > 0 ? (
          <div className="space-y-4">
            {reports.map((report) => (
              <Card 
                  key={report.id} 
                  className="cursor-pointer hover:border-primary transition-colors group"
                  onClick={() => setSelectedReport(report)}
              >
                <CardHeader>
                  <CardTitle className="flex justify-between items-start text-lg sm:text-xl">
                    <div className="flex-1">
                      <span>{formatDate(report.timestamp)}</span>
                      <p className="text-primary text-base font-bold mt-1">{formatCurrency(report.reportData.totalFaturamento)}</p>
                    </div>
                     <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-destructive h-8 w-8 -mt-2 -mr-2"
                      onClick={(e) => handleDeleteRequest(report.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs sm:text-sm text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-2">
                  <p>À Vista: <span className="font-mono text-foreground">{formatCurrency(reportData.totalAVista)}</span></p>
                  <p>Fiado: <span className="font-mono text-destructive">{formatCurrency(reportData.totalFiado)}</span></p>
                  <p>Refeições: <span className="font-mono text-foreground">{reportData.totalMealItems}</span></p>
                  <p>Bomboniere: <span className="font-mono text-foreground">{formatCurrency(reportData.totalBomboniereValue)}</span></p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-16">
            <p>Nenhum relatório salvo encontrado.</p>
          </div>
        )}
      </div>
    </>
  );
}
