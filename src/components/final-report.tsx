
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailyReport, Item } from '@/types';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const groupAndSumItems = (items: Item[]) => {
  const itemSummary: { [key: string]: { quantity: number; total: number } } = {};

  items.forEach(item => {
    // Summarize predefined items
    item.predefinedItems?.forEach(pItem => {
      const key = pItem.name;
      if (!itemSummary[key]) itemSummary[key] = { quantity: 0, total: 0 };
      itemSummary[key].quantity += 1;
      itemSummary[key].total += pItem.price;
    });

    // Summarize bomboniere items
    item.bomboniereItems?.forEach(bItem => {
      const key = bItem.name;
      if (!itemSummary[key]) itemSummary[key] = { quantity: 0, total: 0 };
      itemSummary[key].quantity += bItem.quantity;
      itemSummary[key].total += bItem.price * bItem.quantity;
    });

    // Summarize KG items
    if (item.individualPrices && item.individualPrices.length > 0) {
      const key = 'KG';
      if (!itemSummary[key]) itemSummary[key] = { quantity: 0, total: 0 };
      itemSummary[key].quantity += item.individualPrices.length;
      itemSummary[key].total += item.individualPrices.reduce((sum, price) => sum + price, 0);
    }
  });

  return Object.entries(itemSummary)
    .map(([name, { quantity, total }]) => ({ name, quantity, total }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

interface FinalReportProps {
  report: DailyReport;
}

export default function FinalReport({ report }: FinalReportProps) {
  const summarizedItems = groupAndSumItems(report.items);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relatório Final do Dia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold text-lg mb-2">Totais</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p>
                <span className="text-muted-foreground">À Vista:</span>{' '}
                <span className="font-medium">{formatCurrency(report.totalAVista)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Fiado (Salão):</span>{' '}
                <span className="font-medium">{formatCurrency(report.totalFiadoSalao)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Fiado (Rua):</span>{' '}
                <span className="font-medium">{formatCurrency(report.totalFiadoRua)}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Faturamento Total:</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(report.total)}</p>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="font-semibold text-lg mb-2">Itens Vendidos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            {summarizedItems.map(({ name, quantity, total }) => (
              <div key={name} className="flex justify-between border-b border-dashed pb-1">
                <span>
                  {quantity}x {name}
                </span>
                <span className="font-medium">{formatCurrency(total)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
