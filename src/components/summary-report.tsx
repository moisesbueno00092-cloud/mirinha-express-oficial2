
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo } from 'react';
import type { Item } from '@/types';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

interface SummaryReportProps {
  items: Item[];
}

export default function SummaryReport({ items }: SummaryReportProps) {
  const summary = useMemo(() => {
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

    return { total, totalAVista, totalFiadoRua, totalFiadoSalao };
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumo do Dia</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-muted-foreground">À Vista</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalAVista)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Fiado</p>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(summary.totalFiadoRua + summary.totalFiadoSalao)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Faturamento Total</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(summary.total)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
