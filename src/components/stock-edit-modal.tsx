
'use client';

import { useState, useEffect, useMemo, useCallback }from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Plus, Save, Loader2, Search } from 'lucide-react';
import type { BomboniereItem } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, commitBatch } from '@/firebase/non-blocking-updates';
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


interface StockEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  bomboniereItems: BomboniereItem[];
}

type EditableItem = BomboniereItem;


export default function StockEditModal({ isOpen, onClose, bomboniereItems: initialItems }: StockEditModalProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [localItems, setLocalItems] = useState<EditableItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<EditableItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [originalItemsMap, setOriginalItemsMap] = useState<Record<string, EditableItem>>({});

  useEffect(() => {
    if (isOpen) {
      const sortedItems = [...initialItems].sort((a,b) => a.name.localeCompare(b.name));
      setLocalItems(sortedItems);
      setOriginalItemsMap(Object.fromEntries(initialItems.map(item => [item.id, item])));
    }
  }, [isOpen, initialItems]);


  const filteredItems = useMemo(() => {
    const itemsToFilter = localItems || [];
    if (!searchTerm) return itemsToFilter;
    
    return itemsToFilter.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [localItems, searchTerm]);


  const handleFieldChange = (id: string, field: keyof EditableItem, value: string | number) => {
    setLocalItems(prevItems =>
      prevItems.map(item => {
        if (item.id === id) {
          let finalValue: string | number;
          if (field === 'price' || field === 'estoque') {
            const stringValue = String(value).trim();
            finalValue = stringValue === '' ? 0 : parseFloat(stringValue.replace(',', '.'));
          } else {
            finalValue = value;
          }
          
          if(isNaN(finalValue as number)) return item;
          
          return { ...item, [field]: finalValue };
        }
        return item;
      })
    );
  };
  
  const handleAddNewItem = () => {
    if (!firestore) return;
    const newItemData = { name: 'Novo Item', price: 0, estoque: 0 };
    addDocumentNonBlocking(collection(firestore, "bomboniere_items"), newItemData);

    toast({ title: "Item Adicionado", description: "Um 'Novo Item' foi criado. Por favor, edite-o."});

    setTimeout(() => {
      const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
      }
    }, 500); // Give time for the new item to be received from Firestore and rendered
  };

  const handleDeleteRequest = (item: EditableItem) => {
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

      const batch = writeBatch(firestore);
      let changesCount = 0;

      localItems.forEach(localItem => {
          const originalItem = originalItemsMap[localItem.id];

          // This is a new item that hasn't been saved to originalItemsMap yet, so we must save it.
          // Or this is an existing item and we check for changes.
          if (!originalItem || 
              originalItem.name !== localItem.name || 
              originalItem.price !== localItem.price || 
              originalItem.estoque !== localItem.estoque) {

              if (!localItem.name.trim()) {
                  toast({ variant: 'destructive', title: 'Erro de Validação', description: `O item com ID ${localItem.id} não pode ter um nome em branco.`});
                  return;
              }
              const docRef = doc(firestore, 'bomboniere_items', localItem.id);
              batch.update(docRef, {
                  name: localItem.name,
                  price: localItem.price,
                  estoque: localItem.estoque
              });
              changesCount++;
          }
      });
      
      if (changesCount > 0) {
        try {
            await commitBatch(batch);
            toast({ title: "Sucesso!", description: `${changesCount} ite${changesCount > 1 ? 'ns' : 'm'} atualizado${changesCount > 1 ? 's' : ''}.` });
        } catch (error) {
            // Error is handled by commitBatch
        }
      } else {
        toast({ title: "Nenhuma Alteração", description: "Não havia alterações para salvar."});
      }

      setIsProcessing(false);
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
        <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
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
                {filteredItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-x-4 py-2">
                        <Input
                            value={item.name}
                            onChange={(e) => handleFieldChange(item.id, 'name', e.target.value)}
                            placeholder="Nome do Item"
                        />
                        <Input
                           value={String(item.price).replace('.', ',')}
                           onChange={(e) => handleFieldChange(item.id, 'price', e.target.value.replace(/[^0-9,]/g, ''))}
                           className="text-right"
                           placeholder="0,00"
                        />
                        <Input
                            value={String(item.estoque)}
                             onChange={(e) => handleFieldChange(item.id, 'estoque', e.target.value.replace(/[^0-9]/g, ''))}
                            type="text"
                            className="text-right"
                            placeholder="0"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRequest(item)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                  )
                )}
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
                Salvar Alterações
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
