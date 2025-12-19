
'use client';

import { useState, useEffect, useRef, useMemo, Dispatch, SetStateAction } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, MinusCircle, Plus, Pencil, Trash2, Save, X, Package, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { BomboniereItem, SelectedBomboniereItem } from '@/types';
import { cn } from '@/lib/utils';

interface BomboniereModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItems: (items: SelectedBomboniereItem[]) => void;
  bomboniereItems: BomboniereItem[];
  setBomboniereItems: Dispatch<SetStateAction<BomboniereItem[]>>;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const STOCK_PASSWORD = "1234";

export default function BomboniereModal({ isOpen, onClose, onAddItems, bomboniereItems, setBomboniereItems }: BomboniereModalProps) {
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [view, setView] = useState<'select' | 'edit' | 'stock' | 'password'>('select');
  const [itemToEdit, setItemToEdit] = useState<BomboniereItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockAuthenticated, setStockAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [stockEditValues, setStockEditValues] = useState<Record<string, string>>({});
  
  const addFormRef = useRef<HTMLFormElement>(null);


  useEffect(() => {
    if (isOpen) {
      setSelectedItems({});
      setView('select');
      setItemToEdit(null);
      setSearchTerm('');
      setStockAuthenticated(false);
      setPasswordInput('');
    }
  }, [isOpen]);
  
  const filteredBomboniereItems = useMemo(() => {
    return bomboniereItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a,b) => a.name.localeCompare(b.name));
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
        return { id: item.id, name: item.name, price: item.price, quantity };
      })
      .filter((i): i is SelectedBomboniereItem => i !== null);
    
    onAddItems(itemsToAdd);
  };
  
  const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if(isAdding) {
        const newItemInput = formData.get('newItemInput') as string;
        if(!newItemInput) return;

        const parts = newItemInput.trim().split(' ');
        const priceString = parts.pop()?.replace(',', '.');
        const name = parts.join(' ');
        const price = parseFloat(priceString || '');

        if (name && !isNaN(price) && price > 0) {
            const newItem: BomboniereItem = {
                id: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
                name: name,
                price: price,
                stock: 0
            };
            setBomboniereItems(prev => [...prev, newItem].sort((a,b) => a.name.localeCompare(b.name)));
        }
        if (addFormRef.current) addFormRef.current.reset();
        
    } else if (itemToEdit) {
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;
        const price = parseFloat((formData.get('price') as string).replace(',', '.'));
        const stock = parseInt(formData.get('stock') as string, 10);
        if (id && name && !isNaN(price)) {
            setBomboniereItems(prev => prev.map(item => item.id === id ? { ...item, name, price, stock: isNaN(stock) ? item.stock : stock } : item).sort((a,b) => a.name.localeCompare(b.name)));
        }
        setItemToEdit(null);
    } else {
        setItemToEdit(null);
        setIsAdding(false);
    }
  }

  const handleDeleteRequest = (id: string) => {
    setItemToDelete(id);
  }

  const confirmDelete = () => {
    if (itemToDelete) {
      setBomboniereItems(prev => prev.filter(item => item.id !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === STOCK_PASSWORD) {
        setStockAuthenticated(true);
        setView('stock');
    } else {
        alert("Senha incorreta!");
    }
    setPasswordInput('');
  };

  const handleStockUpdate = (itemId: string, newStock: string) => {
    setStockEditValues(prev => ({ ...prev, [itemId]: newStock }));
  };

  const saveStockChanges = () => {
      setBomboniereItems(prevItems => {
          return prevItems.map(item => {
              const newStockStr = stockEditValues[item.id];
              if (newStockStr !== undefined) {
                  const newStock = parseInt(newStockStr, 10);
                  return isNaN(newStock) ? item : { ...item, stock: newStock };
              }
              return item;
          });
      });
      setStockEditValues({});
  };

  const getStockColor = (stock: number) => {
      if (stock <= 5) return 'text-red-500';
      if (stock <= 20) return 'text-yellow-500';
      if (stock <= 30) return 'text-blue-500';
      return 'text-muted-foreground';
  };
  
  const renderHeader = () => (
    <DialogHeader>
        <div className="flex justify-between items-center relative">
          <div className="flex items-center gap-1 absolute left-0">
            <Button variant="ghost" size="icon" onClick={() => setView('edit')} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => stockAuthenticated ? setView('stock') : setView('password')} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Package className="h-4 w-4" />
            </Button>
          </div>
          <DialogTitle className="flex-grow text-center">Bomboniere</DialogTitle>
        </div>
    </DialogHeader>
  );

  const renderPasswordView = () => (
    <>
      <DialogHeader>
        <DialogTitle>Acesso ao Estoque</DialogTitle>
      </DialogHeader>
      <div className="py-4 space-y-4">
          <p>Digite a senha para gerenciar o estoque.</p>
          <Input 
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              placeholder="Senha"
              autoFocus
          />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setView('select')}>Voltar</Button>
        <Button onClick={handlePasswordSubmit}>Entrar</Button>
      </DialogFooter>
    </>
  );

  const renderStockView = () => (
     <div className="p-1">
        <div className="flex justify-between items-center mb-4">
            <DialogTitle className="text-lg">Gerenciar Estoque</DialogTitle>
            <Button variant="outline" size="sm" onClick={() => setView('select')}>
                <X className="h-4 w-4 mr-2" /> Voltar
            </Button>
        </div>
        <ScrollArea className="h-96">
            <div className="space-y-2 pr-4">
                {bomboniereItems.map(item => (
                    <Card key={item.id} className="flex items-center p-2">
                        <div className="flex-grow">
                            <p className="font-semibold">{item.name}</p>
                            <p className={cn("text-sm font-bold", getStockColor(item.stock))}>Estoque: {item.stock}</p>
                        </div>
                        <Input 
                            type="number"
                            value={stockEditValues[item.id] ?? ''}
                            onChange={(e) => handleStockUpdate(item.id, e.target.value)}
                            className="h-8 w-24"
                            placeholder="Novo..."
                        />
                    </Card>
                ))}
            </div>
        </ScrollArea>
        <Button variant="default" className="w-full mt-4" onClick={saveStockChanges}>
            Salvar Alterações no Estoque
        </Button>
    </div>
  );
  
  const renderEditView = () => (
    <div className="p-1">
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                    Essa ação não pode ser desfeita. Isso excluirá permanentemente o item.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      
      <div className="flex justify-between items-center mb-4">
          <DialogTitle className="text-lg">Gerenciar Itens</DialogTitle>
          <Button variant="outline" size="sm" onClick={() => { setView('select'); setItemToEdit(null); setIsAdding(false); }}>
              <X className="h-4 w-4 mr-2" /> Voltar
          </Button>
      </div>
      <ScrollArea className="h-96">
      <div className="space-y-2 pr-4">
      {bomboniereItems.map(item => (
          itemToEdit?.id === item.id ? (
          <form onSubmit={handleSaveItem} key={item.id} className="bg-muted/50 p-2 rounded-lg">
              <input type="hidden" name="id" value={item.id} />
              <div className="grid grid-cols-[1fr,auto,auto] gap-2">
                  <Input name="name" defaultValue={item.name} className="h-8" />
                  <Input name="price" type="text" defaultValue={String(item.price).replace('.',',')} className="h-8 w-20" />
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
               <div className={cn("text-sm font-bold mr-4", getStockColor(item.stock))}>
                  {item.stock}
               </div>
              <Button variant="ghost" size="icon" onClick={() => setItemToEdit(item)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRequest(item.id)}><Trash2 className="h-4 w-4" /></Button>
          </Card>
          )
      ))}
      {isAdding && (
          <form onSubmit={handleSaveItem} ref={addFormRef} className="bg-muted/50 p-2 rounded-lg">
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
      <Button variant="default" className="w-full mt-4" onClick={() => setIsAdding(prev => !prev)} disabled={isAdding}>
          Adicionar Novo Item
      </Button>
    </div>
  );

  const renderSelectionView = () => (
    <>
      {renderHeader()}
      
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
            <div key={item.id} className="flex items-center p-2">
                <div className="flex-grow pr-4">
                    <p className="font-semibold">{item.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
                      <p className={cn("text-xs font-bold", getStockColor(item.stock))}>(Est: {item.stock})</p>
                    </div>
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

  const renderContent = () => {
    switch (view) {
        case 'edit':
            return renderEditView();
        case 'stock':
            return renderStockView();
        case 'password':
            return renderPasswordView();
        case 'select':
        default:
            return renderSelectionView();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
    

    

    