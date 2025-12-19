
"use client";

import type { Item, Group } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ItemListProps {
  items: Item[];
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  isLoading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '-';
  try {
    return new Date(timestamp).toLocaleTimeString("pt-BR", {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return '-';
  }
};

// Define styles for each group
const groupBadgeStyles: Record<Group, string> = {
  "Vendas salão": "bg-purple-600 hover:bg-purple-700 border-transparent text-white",
  "Fiados salão": "bg-red-600 hover:bg-red-700 border-transparent text-white",
  "Vendas rua": "bg-blue-600 hover:bg-blue-700 border-transparent text-white",
  "Fiados rua": "bg-orange-500 hover:bg-orange-600 border-transparent text-white",
};

const itemBadgeStyles: { [key: string]: string } = {
  PP: "bg-pink-500",
  P: "bg-indigo-500",
  M: "bg-green-600",
  G: "bg-yellow-500 text-black",
  GG: "bg-teal-500",
  KITM: "bg-cyan-500",
  KITG: "bg-sky-500",
  PF: "bg-lime-500 text-black",
  SL: "bg-emerald-500",
  SLKIT: "bg-fuchsia-500",
  KG: "bg-gray-400",
};

const getItemBadgeStyle = (itemName: string) => {
  const style = itemBadgeStyles[itemName.toUpperCase()];
  if (style) {
    return `text-white border-transparent ${style}`;
  }
  return "bg-gray-400 text-white border-transparent";
}


export default function ItemList({ items, onEdit, onDelete, isLoading }: ItemListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
            <TableHead className="px-2 sm:px-4">Item</TableHead>
            <TableHead className="px-2 sm:px-4">Grupo</TableHead>
            <TableHead className="text-right px-2 sm:px-4">Total</TableHead>
            <TableHead className="text-right px-2 sm:px-4">Hora</TableHead>
            <TableHead className="text-right px-2 sm:px-4">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...items].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((item) => (
            <TableRow key={item.id} className={cn(item.group.includes('Fiados') && "text-destructive")}>
              <TableCell className="font-medium px-2 sm:px-4">
                <Badge className={cn("whitespace-nowrap", getItemBadgeStyle(item.name))}>
                  {item.name === 'KG' ? formatCurrency(item.total) : item.name}
                  {item.name !== 'KG' && item.quantity > 1 && ` (x${item.quantity})`}
                </Badge>
              </TableCell>
              <TableCell className="px-2 sm:px-4">
                <Badge className={cn("whitespace-nowrap", groupBadgeStyles[item.group] || "bg-gray-500")}>
                  {item.group}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-semibold px-2 sm:px-4">{formatCurrency(item.total)}</TableCell>
              <TableCell className="text-right px-2 sm:px-4">{formatTimestamp(item.timestamp)}</TableCell>
              <TableCell className="p-0">
                <div className="flex justify-end">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
