"use client";

import { useState, useEffect } from "react";
import type { Item } from "@/types";
import { PlusCircle, Loader2, Save, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ItemFormProps {
  onItemSubmit: (itemName: string, quantity: number) => void;
  isProcessing: boolean;
  editingItem: Item | null;
  onCancelEdit: () => void;
}

export default function ItemForm({ onItemSubmit, isProcessing, editingItem, onCancelEdit }: ItemFormProps) {
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  
  const isEditing = !!editingItem;

  useEffect(() => {
    if (editingItem) {
      // Logic to reconstruct the original input string is tricky.
      // For simplicity, we just fill the name and quantity.
      // A more complex approach would be needed to rebuild prefixes.
      setItemName(editingItem.name);
      setQuantity(editingItem.quantity.toString());
    } else {
      setItemName("");
      setQuantity("1");
    }
  }, [editingItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numQuantity = parseInt(quantity, 10);
    if (!itemName.trim() || isNaN(numQuantity) || numQuantity <= 0) {
      return;
    }
    onItemSubmit(itemName, numQuantity);
    if (!isEditing) {
      setItemName("");
      setQuantity("1");
    }
  };
  
  const handleCancel = () => {
    onCancelEdit();
    setItemName("");
    setQuantity("1");
  }

  return (
    <Card className={isEditing ? "border-primary ring-2 ring-primary" : ""}>
      <CardHeader>
        <CardTitle>{isEditing ? 'Editar Item' : 'Adicionar Novo Item'}</CardTitle>
        {isEditing && <CardDescription>Você está editando o item: <span className="font-bold text-foreground">{editingItem.name}</span></CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid sm:grid-cols-12 gap-4">
          <div className="sm:col-span-8">
            <Input
              type="text"
              placeholder="Ex: M 12,50 Coca ou P"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
              className="h-12 text-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              required
              className="h-12 text-lg text-center"
            />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            {isEditing && (
               <Button type="button" variant="outline" className="w-full h-12" onClick={handleCancel}>
                <XCircle />
              </Button>
            )}
            <Button type="submit" className="w-full h-12" disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="animate-spin" />
              ) : (
                isEditing ? <Save /> : <PlusCircle /> 
              )}
              {isEditing ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
