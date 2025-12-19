"use client";

import { useMemo } from "react";
import type { Item, Group } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface FinalReportProps {
  items: Item[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export default function FinalReport({ items }: FinalReportProps) {
  const reportData = useMemo(() => {
    const data: Record<Group, { items: number; total: number }> = {
      'Vendas salão': { items: 0, total: 0 },
      'Fiados salão': { items: 0, total: 0 },
      'Vendas rua': { items: 0, total: 0 },
      'Fiados rua': { items: 0, total: 0 },
    };

    items.forEach((item) => {
      data[item.group].items += item.quantity;
      data[item.group].total += item.total;
    });

    const grandTotal = Object.values(data).reduce((acc, group) => acc + group.total, 0);

    return { data, grandTotal };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>Nenhum dado para exibir no relatório.</p>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Relatório por Grupo</CardTitle>
        <CardDescription>Resumo financeiro e de itens para cada categoria.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(reportData.data).map(([group, stats]) => (
          <div key={group}>
            <h3 className="text-lg font-semibold mb-2">{group}</h3>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total de Itens:</span>
              <span className="font-mono font-medium">{stats.items}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Valor Total:</span>
              <span className="font-mono font-bold text-lg">{formatCurrency(stats.total)}</span>
            </div>
            <Separator className="my-4" />
          </div>
        ))}
      </CardContent>
      <CardFooter className="bg-muted/50 p-6 rounded-b-lg">
          <div className="w-full flex justify-between items-center">
              <span className="text-lg font-bold">Total Geral de Vendas</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(reportData.grandTotal)}</span>
          </div>
      </CardFooter>
    </Card>
  );
}
