"use client";

import { useState, useEffect } from "react";
import type { Item } from "@/types";
import { PlusCircle, Loader2, Save, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ItemFormProps {
  onItemSubmit: (rawInput: string) => void;
  isProcessing: boolean;
  editingItem: Item | null;
  onCancelEdit: () => void;
}

export default function ItemForm({ onItemSubmit, isProcessing, editingItem, onCancelEdit }: ItemFormProps) {
  const [rawInput, setRawInput] = useState("");
  
  const isEditing = !!editingItem;

  useEffect(() => {
    if (editingItem) {
      // When editing, reconstruct a string that includes quantity and name
      setRawInput(`${editingItem.quantity}${editingItem.name}`);
    } else {
      setRawInput("");
    }
  }, [editingItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawInput.trim()) {
      return;
    }
    onItemSubmit(rawInput);
    if (!isEditing) {
      setRawInput("");
    }
  };
  
  const handleCancel = () => {
    onCancelEdit();
    setRawInput("");
  }

  return (
    <Card className={isEditing ? "border-primary ring-2 ring-primary" : ""}>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-xl sm:text-2xl">{isEditing ? 'Editar Item' : 'Adicionar Novo Item'}</CardTitle>
        {isEditing && <CardDescription>Você está editando o item: <span className="font-bold text-foreground">{`${editingItem.quantity}x ${editingItem.name}`}</span></CardDescription>}
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-2">
          <div className="col-span-10">
            <Input
              type="text"
              placeholder="Ex: 2p ou M 12,50 Coca"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              required
              className="h-10 sm:h-12 text-base"
              autoFocus
            />
          </div>
          <div className="col-span-2 flex gap-2">
            {isEditing && (
               <Button type="button" variant="outline" className="w-full h-10 sm:h-12" onClick={handleCancel}>
                <XCircle />
              </Button>
            )}
            <Button type="submit" className="w-full h-10 sm:h-12 text-sm" disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="animate-spin" />
              ) : (
                isEditing ? <Save /> : <PlusCircle /> 
              )}
              <span className="sr-only sm:not-sr-only">{isEditing ? 'Salvar' : 'Adicionar'}</span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
