"use client";

import type { Item } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ItemListProps {
  items: Item[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function ItemList({ items }: ItemListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>Nenhum item adicionado ainda.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Grupo</TableHead>
            <TableHead className="text-right">Qtd.</TableHead>
            <TableHead className="text-right">Preço Unit.</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Hora</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...items].reverse().map((item) => (
            <TableRow key={item.id} className={cn(item.group.includes('Fiados') && "text-destructive")}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>
                <Badge variant={item.group.includes('Fiados') ? "destructive" : "secondary"}>
                  {item.group}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(item.total)}</TableCell>
              <TableCell className="text-right">{formatTimestamp(item.timestamp)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
