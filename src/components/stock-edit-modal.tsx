
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Plus, Save, Loader2, Search } from 'lucide-react';
import type { BomboniereItem } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { collection, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

interface StockEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  bomboniereItems: BomboniereItem[];
}

type EditableItem = Omit<BomboniereItem, 'id'> & { id?: string; estoque: string | number };

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

export default function StockEditModal({ isOpen, onClose, bomboniereItems: initialItems }: StockEditModalProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [items, setItems] = useState<EditableItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<EditableItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      const sortedItems = [...initialItems].sort((a,b) => a.name.localeCompare(b.name));
      setItems(sortedItems.map(item => ({...item, estoque: item.estoque ?? 0})));
      setSearchTerm("");
    }
  }, [isOpen, initialItems]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items.map((_, index) => index);
    
    return items.reduce((acc, item, index) => {
        if (item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            acc.push(index);
        }
        return acc;
    }, [] as number[]);
  }, [items, searchTerm]);


  const handleFieldChange = (index: number, field: keyof EditableItem, value: string) => {
    const newItems = [...items];
    const item = newItems[index];

    if (field === 'price' || field === 'estoque') {
        const numericValue = value.replace(',', '.');
        if (!isNaN(parseFloat(numericValue)) || numericValue === '') {
            (item[field] as any) = numericValue;
        }
    } else {
        (item[field] as any) = value;
    }
    setItems(newItems);
  };
  
  const handleAddNewItem = () => {
    setItems(prevItems => [...prevItems, { name: '', price: '', estoque: '' }]);
    setTimeout(() => {
      const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
      }
    }, 100);
  };

  const handleDeleteRequest = (item: EditableItem, index: number) => {
      if (!item.id) { // unsaved item
          const newItems = items.filter((_, i) => i !== index);
          setItems(newItems);
          return;
      }
      setItemToDelete(item);
  }

  const confirmDelete = () => {
      if (!firestore || !itemToDelete || !itemToDelete.id) return;
      const docRef = doc(firestore, 'bomboniere_items', itemToDelete.id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Sucesso", description: `"${itemToDelete.name}" foi removido.`});
      setItemToDelete(null);
  }

  const handleSaveAll = async () => {
      if (!firestore) return;
      setIsProcessing(true);

      const bomboniereCollectionRef = collection(firestore, "bomboniere_items");

      for (const item of items) {
          const { name, price, estoque } = item;
          if (!name.trim() || String(price).trim() === '' || String(estoque).trim() === '') {
              toast({ variant: 'destructive', title: 'Erro de Validação', description: `O item "${name || 'novo'}" tem campos em branco.`});
              setIsProcessing(false);
              return;
          }

          const finalPrice = parseFloat(String(price).replace(',', '.'));
          const finalStock = parseInt(String(estoque), 10);
          
          if(isNaN(finalPrice) || isNaN(finalStock)) {
             toast({ variant: 'destructive', title: 'Erro de Validação', description: `O item "${name}" tem valores inválidos para preço ou estoque.`});
             setIsProcessing(false);
             return;
          }

          const itemData = { name: name.trim(), price: finalPrice, estoque: finalStock };

          if (item.id) { // Update existing
              const docRef = doc(bomboniereCollectionRef, item.id);
              updateDocumentNonBlocking(docRef, itemData);
          } else { // Add new
              await addDocumentNonBlocking(bomboniereCollectionRef, itemData);
          }
      }
      
      setIsProcessing(false);
      toast({ title: "Sucesso", description: "Estoque da bomboniere atualizado." });
      onClose();
  };
  

  return (
    <>
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O item "{itemToDelete?.name}" será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle className="text-center">Gerir Estoque da Bomboniere</DialogTitle>
            </DialogHeader>
            
            <div className="relative px-2">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar item..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                />
            </div>

            <div className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-2 font-semibold text-sm text-muted-foreground">
              <span>Nome do Item</span>
              <span className="text-right">Preço (R$)</span>
              <span className="text-right">Estoque</span>
              <span />
            </div>

            <ScrollArea className="h-80 -mx-6">
              <div className="px-6 divide-y divide-border">
                {filteredItems.map((itemIndex) => {
                  const item = items[itemIndex];
                  return (
                    <div key={item.id || `new-${itemIndex}`} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-x-4 py-2">
                        <Input
                            value={item.name}
                            onChange={(e) => handleFieldChange(itemIndex, 'name', e.target.value)}
                            placeholder="Nome do Item"
                            className={cn(!item.id && "border-green-500")}
                        />
                        <Input
                            value={String(item.price).replace('.', ',')}
                            onChange={(e) => handleFieldChange(itemIndex, 'price', e.target.value)}
                            className="text-right"
                            placeholder="0,00"
                        />
                        <Input
                            value={String(item.estoque)}
                            onChange={(e) => handleFieldChange(itemIndex, 'estoque', e.target.value)}
                            type="number"
                            className="text-right"
                            placeholder="0"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRequest(item, itemIndex)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            <div className="px-6 mt-2">
                <Button variant="outline" className="w-full" onClick={handleAddNewItem}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Novo Item
                </Button>
            </div>

            <DialogFooter className="mt-4">
              <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button onClick={handleSaveAll} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                Salvar Tudo
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

