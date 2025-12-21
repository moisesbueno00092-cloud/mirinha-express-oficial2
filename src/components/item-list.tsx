
"use client";

import type { Item, Group, PredefinedItem, SelectedBomboniereItem } from "@/types";
import { DELIVERY_FEE } from "@/lib/constants";
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
import { Pencil, Trash2, Loader2, User } from "lucide-react";
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

const groupBadgeStyles: Record<Group, string> = {
  "Vendas salão": "bg-purple-600 hover:bg-purple-700 border-transparent text-white",
  "Fiados salão": "bg-destructive hover:bg-destructive/90 border-transparent text-destructive-foreground",
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
  PF: "bg-orange-400 text-black",
  SL: "bg-emerald-500",
  SLKIT: "bg-fuchsia-500",
  S: "bg-amber-600",
  KG: "bg-gray-400",
  "LANÇAMENTO MISTO": "bg-gray-700",
  BOMBONIERE: "bg-rose-500"
};

const getItemBadgeStyle = (itemName: string) => {
  const normalizedItemName = itemName.replace(/^\d+/, '').toUpperCase();
  const style = itemBadgeStyles[normalizedItemName];
  if (style) {
    return `text-white border-transparent ${style}`;
  }
  
  // Fallback for bomboniere items
  if(itemName.includes('-')) return `text-white border-transparent ${itemBadgeStyles['BOMBONIERE']}`;
  
  return "bg-gray-500 text-white border-transparent";
}

const renderItemName = (item: Item) => {
    const itemElements = [];

    // Handle favorite client
    if (item.customerName) {
      itemElements.push(
        <div key={`fav-client-${item.id}`} className="flex flex-col items-start">
            <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-amber-500" />
                <span className="font-semibold">{item.customerName}</span>
            </div>
            <span className="text-xs text-muted-foreground pl-5">{item.name}</span>
        </div>
      );
      return <div className="flex flex-wrap gap-2 items-start">{itemElements}</div>;
    }


    // Handle predefined items by counting them
    if (item.predefinedItems && item.predefinedItems.length > 0) {
      const itemCounts: Record<string, { count: number; price: number }> = {};
      item.predefinedItems.forEach(pItem => {
        const key = `${pItem.name}-${pItem.price}`;
        if (!itemCounts[key]) {
          itemCounts[key] = { count: 0, price: pItem.price };
        }
        itemCounts[key].count++;
      });
      
      const sortedItems = Object.entries(itemCounts).sort((a,b) => a[0].localeCompare(b[0]));
      
      sortedItems.forEach(([key, { count, price }]) => {
        const name = key.split('-')[0];
        const badgeLabel = count > 1 ? `${count}${name}` : name;
        itemElements.push(
            <div key={`predefined-group-${key}`} className="flex flex-col items-center">
                <Badge className={cn("whitespace-nowrap", getItemBadgeStyle(name))}>
                    {badgeLabel}
                </Badge>
                <span className="text-muted-foreground mt-0.5" style={{ fontSize: '0.6rem', letterSpacing: '-0.1em' }}>
                    {formatCurrency(price)}
                </span>
            </div>
        );
      });
    }

    // Handle KG items
    if (item.individualPrices && item.individualPrices.length > 0) {
        item.individualPrices.forEach((price, index) => {
            itemElements.push(
                <div key={`kg-${index}`} className="flex flex-col items-center">
                    <Badge className={cn("whitespace-nowrap", getItemBadgeStyle('KG'))}>
                        KG
                    </Badge>
                    <span className="text-muted-foreground mt-0.5" style={{ fontSize: '0.6rem', letterSpacing: '-0.1em' }}>
                        {formatCurrency(price)}
                    </span>
                </div>
            );
        });
    }
    
    // Handle bomboniere items
    if (item.bomboniereItems && item.bomboniereItems.length > 0) {
        item.bomboniereItems.forEach((bItem, index) => {
            const badgeLabel = bItem.quantity > 1 ? `${bItem.quantity}${bItem.name.replace(/\s+/g, '-')}` : bItem.name.replace(/\s+/g, '-');
            itemElements.push(
                <div key={`bomboniere-group-${index}`} className="flex flex-col items-center">
                    <Badge className={cn("whitespace-nowrap", getItemBadgeStyle(bItem.name))}>
                        {badgeLabel}
                    </Badge>
                     <span className="text-muted-foreground mt-0.5" style={{ fontSize: '0.6rem', letterSpacing: '-0.1em' }}>
                        {formatCurrency(bItem.price)}
                    </span>
                </div>
            );
        });
    }

    if (itemElements.length === 0 && item.name) {
       return <Badge className={cn("whitespace-nowrap", getItemBadgeStyle(item.name))}>{item.name}</Badge>;
    }

    return <div className="flex flex-wrap gap-2 items-start">{itemElements}</div>;
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
            <TableRow key={item.id} className={cn(item.group.includes('Fiados') && "text-destructive", "border-b-0")}>
              <TableCell className="font-medium px-2 sm:px-4 align-top">
                {renderItemName(item)}
              </TableCell>
              <TableCell className="px-2 sm:px-4 align-top">
                <Badge className={cn("whitespace-nowrap", groupBadgeStyles[item.group] || "bg-gray-500")}>
                  {item.group}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-semibold px-2 sm:px-4 align-top">
                <div>{formatCurrency(item.total)}</div>
                {item.group.includes('rua') && item.deliveryFee === 0 && (
                   <div className="text-muted-foreground font-light" style={{ fontSize: '0.6rem' }}>(Isento)</div>
                )}
                {item.deliveryFee > 0 && item.deliveryFee !== DELIVERY_FEE && (
                    <div className="text-muted-foreground font-light" style={{ fontSize: '0.6rem' }}>(Taxa Manual)</div>
                )}
              </TableCell>
              <TableCell className="text-right px-2 sm:px-4 align-top">{formatTimestamp(item.timestamp)}</TableCell>
              <TableCell className="p-0 align-top">
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
