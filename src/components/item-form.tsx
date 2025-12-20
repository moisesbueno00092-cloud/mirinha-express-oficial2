"use client";

import { useRef } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ItemFormProps {
  rawInput: string;
  setRawInput: (value: string) => void;
  onItemSubmit: (e: React.FormEvent) => void;
  onOpenBomboniere: () => void;
  isProcessing: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  children?: React.ReactNode;
}

export default function ItemForm({ 
    rawInput, 
    setRawInput, 
    onItemSubmit, 
    onOpenBomboniere,
    isProcessing,
    inputRef,
    children
}: ItemFormProps) {
  
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-xl sm:text-2xl">Adicionar Novo Item</CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <form onSubmit={onItemSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder=""
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              className="h-10 flex-1 sm:h-12 text-base"
              disabled={isProcessing}
            />
            {children}
            <Button 
                type="button" 
                variant="outline"
                className="h-10 sm:h-12 px-4" 
                onClick={onOpenBomboniere}
                disabled={isProcessing}
            >
              <span className="sm:hidden"><Plus /></span>
              <span className="hidden sm:inline">Outros</span>
            </Button>
            <Button 
                type="submit" 
                className="h-10 sm:h-12 px-4"
                disabled={isProcessing || !rawInput.trim()}
            >
              {isProcessing ? (
                <Loader2 className="animate-spin" />
              ) : "Adicionar"}
            </Button>
        </form>
      </CardContent>
    </Card>
  );
}
