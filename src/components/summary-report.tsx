"use client";

import { useMemo } from "react";
import type { Item } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

interface SummaryReportProps {
  items: Item[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export default function SummaryReport({ items }: SummaryReportProps) {
  const summary = useMemo(() => {
    const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
    
    const salesItems = items.filter(item => item.name.toUpperCase() !== 'EXTRAS');
    const extrasItems = items.filter(item => item.name.toUpperCase() === 'EXTRAS');

    const totalSalesValue = salesItems.reduce((acc, item) => acc + item.total, 0);
    const totalExtrasValue = extrasItems.reduce((acc, item) => acc + item.total, 0);
    const grandTotal = totalSalesValue + totalExtrasValue;

    const uniqueItems: { [key: string]: { quantity: number; total: number } } = {};
    items.forEach((item) => {
      const key = item.name;
      if (!uniqueItems[key]) {
        uniqueItems[key] = { quantity: 0, total: 0 };
      }
      uniqueItems[key].quantity += item.quantity;
      uniqueItems[key].total += item.total;
    });

    return {
      totalItems,
      totalSalesValue,
      totalExtrasValue,
      grandTotal,
      uniqueItems: Object.entries(uniqueItems).sort((a, b) => b[1].total - a[1].total),
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>Nenhum dado para exibir no resumo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Visão Geral</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Itens Totais</p>
            <p className="text-2xl font-bold">{summary.totalItems}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Vendas</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalSalesValue)}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Extras</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalExtrasValue)}</p>
          </div>
          <div className="p-4 bg-primary/10 rounded-lg text-primary-foreground">
            <p className="text-sm text-primary/80">Total Geral</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(summary.grandTotal)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens Agrupados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Quantidade Total</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.uniqueItems.map(([name, data]) => (
                <TableRow key={name}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="text-right">{data.quantity}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(data.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
