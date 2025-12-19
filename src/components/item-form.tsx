"use client";

import { useState } from "react";
import { PlusCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ItemFormProps {
  onAddItem: (itemName: string, quantity: number) => void;
  isProcessing: boolean;
}

export default function ItemForm({ onAddItem, isProcessing }: ItemFormProps) {
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numQuantity = parseInt(quantity, 10);
    if (!itemName.trim() || isNaN(numQuantity) || numQuantity <= 0) {
      return;
    }
    onAddItem(itemName, numQuantity);
    setItemName("");
    setQuantity("1");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar Novo Item</CardTitle>
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
          <div className="sm:col-span-2">
            <Button type="submit" className="w-full h-12" disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <PlusCircle className="mr-2" />
              )}
              Adicionar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
