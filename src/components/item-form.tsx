"use client";

import { useState, useEffect, useRef } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  
  const isEditing = !!editingItem;

  useEffect(() => {
    if (editingItem) {
      // When editing, reconstruct a string that includes quantity and name
      let reconstructedInput = `${editingItem.name}`;
      
      const groupPrefixMap: { [K in Item['group']]?: string } = {
          'Fiados rua': 'Fr ',
          'Fiados salão': 'F ',
          'Vendas rua': 'R ',
          'Vendas salão': 'M ',
      };
      const prefix = groupPrefixMap[editingItem.group];
      if (prefix) {
          reconstructedInput = prefix + reconstructedInput;
      }
      
      if(editingItem.quantity > 1) {
          reconstructedInput = `${editingItem.quantity} ` + reconstructedInput;
      }

      setRawInput(reconstructedInput);
    } else {
      setRawInput("");
    }
    inputRef.current?.focus();
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
        <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Ex: 2p ou M 12,50 Coca"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              required
              className="h-10 flex-1 sm:h-12 text-base"
            />
            <div className="flex gap-2">
                {isEditing && (
                   <Button type="button" variant="outline" size="icon" className="w-10 h-10 sm:w-12 sm:h-12" onClick={handleCancel}>
                    <XCircle />
                  </Button>
                )}
                <Button type="submit" size="icon" className="w-10 h-10 sm:w-12 sm:h-12" disabled={isProcessing}>
                  {isProcessing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    isEditing ? <Save /> : <PlusCircle /> 
                  )}
                  <span className="sr-only">{isEditing ? 'Salvar' : 'Adicionar'}</span>
                </Button>
            </div>
        </form>
      </CardContent>
    </Card>
  );
}
