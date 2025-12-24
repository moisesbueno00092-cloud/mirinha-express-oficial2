
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Item, Group } from '@/types';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (e) {
    return '-';
  }
};

const groupBadgeStyles: Record<Group, string> = {
  'Vendas salão': 'bg-purple-600 hover:bg-purple-700',
  'Fiados salão': 'bg-red-600 hover:bg-red-700',
  'Vendas rua': 'bg-blue-600 hover:bg-blue-700',
  'Fiados rua': 'bg-orange-500 hover:bg-orange-600',
};

interface HistoryReportDetailProps {
  items: Item[];
}

const renderItemName = (item: Item) => {
    const itemElements = [];

    if (item.predefinedItems && item.predefinedItems.length > 0) {
      itemElements.push(...item.predefinedItems.map((pItem, index) => (
        <Badge key={`predefined-${index}`} variant="secondary">{pItem.name}</Badge>
      )));
    }
    if (item.individualPrices && item.individualPrices.length > 0) {
        itemElements.push(<Badge key="kg" variant="secondary">KG</Badge>);
    }
    if (item.bomboniereItems && item.bomboniereItems.length > 0) {
        itemElements.push(...item.bomboniereItems.map((bItem, index) => (
            <Badge key={`bomboniere-${index}`} variant="secondary">{bItem.quantity}x {bItem.name}</Badge>
        )));
    }

    return (
        <div className="flex flex-col items-start gap-2">
            {item.customerName && (
                <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-amber-500" />
                    <span className="font-semibold text-xs text-foreground/80">{item.customerName}</span>
                </div>
            )}
            <div className="flex flex-wrap gap-1 items-start">{itemElements}</div>
        </div>
    );
};

export default function HistoryReportDetail({ items }: HistoryReportDetailProps) {
  const sortedItems = [...items].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalhes dos Lançamentos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{renderItemName(item)}</TableCell>
                  <TableCell>
                    <Badge className={cn('whitespace-nowrap text-white', groupBadgeStyles[item.group] || 'bg-gray-500')}>
                      {item.group}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(item.total)}</TableCell>
                  <TableCell className="text-right">{formatTimestamp(item.timestamp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
