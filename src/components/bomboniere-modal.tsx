
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, MinusCircle, Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import usePersistentState from '@/hooks/use-persistent-state';
import type { BomboniereItem, SelectedBomboniereItem } from '@/types';
import { BOMBONIERE_ITEMS_DEFAULT } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface BomboniereModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItems: (items: SelectedBomboniereItem[]) => void;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};


export default function BomboniereModal({ isOpen, onClose, onAddItems }: BomboniereModalProps) {
  const [bomboniereItems, setBomboniereItems] = usePersistentState<BomboniereItem[]>('bomboniereItems', BOMBONIERE_ITEMS_DEFAULT);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<BomboniereItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const formRef = useRef<HTMLFormElement>(null);


  useEffect(() => {
    if (isOpen) {
      setSelectedItems({});
      setIsEditing(false);
      setIsAdding(false);
      setItemToEdit(null);
      setSearchTerm('');
    }
  }, [isOpen]);
  
  const filteredBomboniereItems = useMemo(() => {
    return bomboniereItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bomboniereItems, searchTerm]);

  const handleQuantityChange = (itemId: string, delta: number) => {
    setSelectedItems(prev => {
      const currentQuantity = prev[itemId] || 0;
      const newQuantity = Math.max(0, currentQuantity + delta);
      if (newQuantity === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: newQuantity };
    });
  };

  const handleAddClick = () => {
    const itemsToAdd: SelectedBomboniereItem[] = Object.entries(selectedItems)
      .map(([itemId, quantity]) => {
        const item = bomboniereItems.find(i => i.id === itemId);
        if (!item) return null;
        return { name: item.name, price: item.price, quantity };
      })
      .filter((i): i is SelectedBomboniereItem => i !== null);
    
    onAddItems(itemsToAdd);
  };
  
  const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if(isAdding) {
        const newItemInput = formData.get('newItemInput') as string;
        if(!newItemInput) {
            // Do not close if input is empty, just ignore
            return;
        }

        const parts = newItemInput.trim().split(' ');
        const priceString = parts.pop()?.replace(',', '.');
        const name = parts.join(' ');
        const price = parseFloat(priceString || '');

        if (name && !isNaN(price) && price > 0) {
            const newItem: BomboniereItem = {
                id: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
                name: name,
                price: price
            };
            setBomboniereItems(prev => [...prev, newItem].sort((a,b) => a.name.localeCompare(b.name)));
        }
        
        if (formRef.current) {
          formRef.current.reset();
        }
    } else if (itemToEdit) {
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;
        const price = parseFloat((formData.get('price') as string).replace(',', '.'));
        if (id && name && !isNaN(price)) {
            setBomboniereItems(prev => prev.map(item => item.id === id ? { ...item, name, price } : item).sort((a,b) => a.name.localeCompare(b.name)));
        }
        setItemToEdit(null);
    } else {
        setItemToEdit(null);
        setIsAdding(false);
    }
  }

  const handleDeleteItem = (id: string) => {
    setBomboniereItems(prev => prev.filter(item => item.id !== id));
  }
  
  const renderEditView = () => (
    <div className="p-1">
        <div className="flex justify-between items-center mb-4">
            <DialogTitle className="text-lg">Gerenciar Itens</DialogTitle>
             <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setItemToEdit(null); setIsAdding(false); }}>
                <X className="h-4 w-4 mr-2" /> Voltar
            </Button>
        </div>
        <ScrollArea className="h-96">
        <div className="space-y-2 pr-4">
        {bomboniereItems.map(item => (
            itemToEdit?.id === item.id ? (
             <form onSubmit={handleSaveItem} key={item.id} className="bg-muted/50 p-2 rounded-lg">
                <input type="hidden" name="id" value={item.id} />
                <div className="flex gap-2">
                    <Input name="name" defaultValue={item.name} className="h-8" />
                    <Input name="price" type="text" defaultValue={String(item.price).replace('.',',')} className="h-8 w-24" />
                    <Button type="submit" size="icon" className="h-8 w-8 shrink-0">
                        <Save className="h-4 w-4" />
                    </Button>
                </div>
            </form>
            ) : (
            <Card key={item.id} className="flex items-center p-2">
                <div className="flex-grow">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setItemToEdit(item)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
            </Card>
            )
        ))}
        {isAdding && (
            <form onSubmit={handleSaveItem} ref={formRef} className="bg-muted/50 p-2 rounded-lg">
                <div className="flex gap-2">
                    <Input name="newItemInput" placeholder="Nome do item e preço (Ex: Trident 2.50)" autoFocus className="h-8" />
                    <Button type="submit" size="icon" className="h-8 w-8 shrink-0">
                        <Save className="h-4 w-4" />
                    </Button>
                </div>
            </form>
        )}
        </div>
        </ScrollArea>
        <Button variant="default" className="w-full mt-4" onClick={() => setIsAdding(true)} disabled={isAdding}>
            <Plus className="h-4 w-4 mr-2"/>
            Adicionar Novo Item
        </Button>
    </div>
  );

  const renderSelectionView = () => (
    <>
      <DialogHeader>
          <div className="flex justify-between items-center relative">
            <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} className="h-8 w-8 absolute left-0 text-muted-foreground hover:text-foreground">
                <Pencil className="h-4 w-4" />
            </Button>
            <DialogTitle className="flex-grow text-center">Bomboniere</DialogTitle>
          </div>
      </DialogHeader>
      
      <div className="px-1 pt-2 pb-1">
        <Input 
            placeholder="Buscar item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9"
        />
      </div>

      <ScrollArea className="h-80 -mx-6">
        <div className="divide-y divide-border">
          {filteredBomboniereItems.map((item) => (
            <div key={item.id} className="flex items-center py-3 px-6">
              <div className="flex-grow pr-4">
                <p className="font-semibold text-base">{item.name}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                {selectedItems[item.id] > 0 ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      onClick={() => handleQuantityChange(item.id, -1)}
                    >
                      <MinusCircle className="h-6 w-6 text-destructive" />
                    </Button>
                    <span className="text-lg font-bold w-6 text-center tabular-nums">{selectedItems[item.id]}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      onClick={() => handleQuantityChange(item.id, 1)}
                    >
                      <PlusCircle className="h-6 w-6 text-primary" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => handleQuantityChange(item.id, 1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <DialogFooter className="mt-4">
        <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
        </DialogClose>
        <Button onClick={handleAddClick} disabled={Object.keys(selectedItems).length === 0}>
          Adicionar Itens
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        {isEditing ? renderEditView() : renderSelectionView()}
      </DialogContent>
    </Dialog>
  );
}
    