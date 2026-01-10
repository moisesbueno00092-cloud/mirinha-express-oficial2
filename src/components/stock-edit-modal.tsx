
'use client';

import { useState, useEffect, useMemo, useCallback }from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Plus, Save, Loader2, Search, XCircle } from 'lucide-react';
import type { BomboniereItem, EntradaMercadoria, Item as OrderItem } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, writeBatch, query, addDoc, deleteDoc, where, getDocs } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
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

type EditableItem = Partial<BomboniereItem> & { isNew?: boolean; id: string };


export default function StockEditModal({ isOpen, onClose, bomboniereItems: initialItems }: StockEditModalProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [localItems, setLocalItems] = useState<EditableItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<EditableItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [originalItemsMap, setOriginalItemsMap] = useState<Record<string, EditableItem>>({});

  const allOrderItemsCollectionRef = useMemoFirebase(() => firestore ? collection(firestore, 'order_items') : null, [firestore]);
  const allLiveItemsCollectionRef = useMemoFirebase(() => firestore ? collection(firestore, 'live_items') : null, [firestore]);
  const allEntradasCollectionRef = useMemoFirebase(() => firestore ? collection(firestore, 'entradas_mercadorias') : null, [firestore]);


  useEffect(() => {
    if (isOpen) {
      const sortedItems = [...initialItems].sort((a,b) => a.name.localeCompare(b.name));
      setLocalItems(sortedItems);
      setOriginalItemsMap(Object.fromEntries(initialItems.map(item => [item.id, item])));
      setSearchTerm("");
    }
  }, [isOpen, initialItems]);


  const filteredItems = useMemo(() => {
    const itemsToFilter = localItems || [];
    if (!searchTerm) return itemsToFilter;
    
    return itemsToFilter.filter(item => 
      item.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [localItems, searchTerm]);


  const handleFieldChange = (id: string, field: keyof EditableItem, value: string | number) => {
    setLocalItems(prevItems =>
      prevItems.map(item => {
        if (item.id === id) {
          if (field === 'price' || field === 'estoque') {
            const stringValue = String(value).trim();
            if (stringValue === '') {
                 return { ...item, [field]: '' };
            }
            const finalValue = parseFloat(stringValue.replace(',', '.'));
             if (isNaN(finalValue)) return item;
             return { ...item, [field]: finalValue };
          } else {
             return { ...item, [field]: value };
          }
        }
        return item;
      })
    );
  };
  
  const handleAddNewItem = () => {
    const newItem: EditableItem = {
      id: `new-${Date.now()}`,
      name: '',
      price: 0,
      estoque: 0,
      isNew: true,
    };
    setLocalItems(prev => [newItem, ...prev]);
  };

  const handleRemoveNewItem = (id: string) => {
    setLocalItems(prev => prev.filter(item => item.id !== id));
  };

  const handleDeleteRequest = async (item: EditableItem) => {
      if (item.isNew && item.id) {
        handleRemoveNewItem(item.id);
        return;
      }
      
      const itemNameLower = item.name?.toLowerCase();
      if (!firestore || !itemNameLower) return;

      let isInHistory = false;

      // Check live_items, order_items, entradas_mercadorias
      const collectionsToCheck = [allLiveItemsCollectionRef, allOrderItemsCollectionRef];
      
      for(const coll of collectionsToCheck) {
        if(!coll) continue;
        const q = query(coll, where('bomboniereItems', 'array-contains', { name: item.name }));
        const snapshot = await getDocs(q as any);
        if(!snapshot.empty) {
          isInHistory = true;
          break;
        }
      }
      
      if (!isInHistory && allEntradasCollectionRef) {
          const q = query(allEntradasCollectionRef, where('produtoNome', '==', item.name));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
              isInHistory = true;
          }
      }

      if (isInHistory) {
           toast({
                variant: 'destructive',
                title: 'Exclusão Bloqueada',
                description: `"${item.name}" não pode ser apagado pois possui histórico de vendas ou compras. Para o remover da lista, considere alterar o seu nome (ex: "zz_${item.name}") ou zerar o estoque.`,
                duration: 8000,
           });
           return;
      }

      setItemToDelete(item);
  }

  const confirmDelete = async () => {
      if (!firestore || !itemToDelete || !itemToDelete.id || itemToDelete.isNew) return;
      const docRef = doc(firestore, 'bomboniere_items', itemToDelete.id);
      await deleteDoc(docRef);
      toast({ title: "Sucesso", description: `"${itemToDelete.name}" foi removido.`});
      setItemToDelete(null);
  }
  
  const handleSaveAll = async () => {
      if (!firestore) return;
      setIsProcessing(true);

      const batch = writeBatch(firestore);
      let changesCount = 0;
      let hasValidationError = false;

      for (const localItem of localItems) {
          if (localItem.isNew) {
              if (!localItem.name?.trim()) {
                  toast({ variant: 'destructive', title: 'Erro de Validação', description: `O nome de um novo item não pode ser vazio.`});
                  hasValidationError = true;
                  break;
              }
              const newDocRef = doc(collection(firestore, 'bomboniere_items'));
              batch.set(newDocRef, {
                  name: localItem.name,
                  price: Number(localItem.price) || 0,
                  estoque: Number(localItem.estoque) || 0,
              });
              changesCount++;
          } else {
              const originalItem = originalItemsMap[localItem.id];
              const hasChanged = !originalItem || 
                  originalItem.name !== localItem.name || 
                  Number(originalItem.price) !== Number(localItem.price) || 
                  Number(originalItem.estoque) !== Number(localItem.estoque);

              if (hasChanged) {
                  if (!localItem.name?.trim()) {
                      toast({ variant: 'destructive', title: 'Erro de Validação', description: `O nome de um item não pode ser vazio.`});
                      hasValidationError = true;
                      break;
                  }
                  const docRef = doc(firestore, 'bomboniere_items', localItem.id);
                  batch.update(docRef, {
                      name: localItem.name,
                      price: Number(localItem.price) || 0,
                      estoque: Number(localItem.estoque) || 0,
                  });
                  changesCount++;
              }
          }
      }
      
      if (hasValidationError) {
          setIsProcessing(false);
          return;
      }

      if (changesCount > 0) {
        try {
            await batch.commit();
            toast({ title: "Sucesso!", description: `${changesCount} ite${changesCount > 1 ? 'ns' : 'm'} atualizado${changesCount > 1 ? 's' : ''}.` });
        } catch (error) {
            console.error("Error saving stock:", error);
            toast({ variant: 'destructive', title: 'Erro ao Salvar', description: 'Não foi possível atualizar o estoque.' });
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
                            value={item.name || ''}
                            onChange={(e) => handleFieldChange(item.id, 'name', e.target.value)}
                            placeholder="Nome do Item"
                        />
                        <Input
                           value={String(item.price ?? '0').replace('.', ',')}
                           onChange={(e) => handleFieldChange(item.id, 'price', e.target.value.replace(/[^0-9,]/g, ''))}
                           className="text-right"
                           placeholder="0,00"
                        />
                        <Input
                            value={String(item.estoque ?? '0')}
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
                            {item.isNew ? <XCircle className="h-5 w-5" /> : <Trash2 className="h-4 w-4" />}
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
