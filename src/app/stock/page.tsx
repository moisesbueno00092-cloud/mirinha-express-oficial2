
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc, query, orderBy } from 'firebase/firestore';
import type { BomboniereItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowLeft, Save, Trash2, Plus } from 'lucide-react';
import Link from 'next/link';
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
import { addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import MirinhaLogo from '@/components/mirinha-logo';

const getStockColor = (stock: number) => {
    if (stock <= 5) return 'text-destructive';
    if (stock <= 20) return 'text-yellow-500';
    if (stock <= 30) return 'text-blue-500';
    return 'text-muted-foreground';
};

export default function StockPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const bomboniereItemsQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null), [firestore]);
    const { data: bomboniereItems, isLoading, error } = useCollection<BomboniereItem>(bomboniereItemsQuery);
    
    const [editValues, setEditValues] = useState<Record<string, Partial<Omit<BomboniereItem, 'id'>>>>({});
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [newItemStock, setNewItemStock] = useState('');

    const handleInputChange = (id: string, field: 'name' | 'price' | 'stock', value: string) => {
        setEditValues(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: field === 'name' ? value : value.replace(',', '.'),
            }
        }));
    };
    
    const handleSave = (id: string) => {
        if (!firestore) return;

        const itemData = editValues[id];
        if (!itemData) return;
        
        const updatePayload: Partial<BomboniereItem> = {};
        
        if (itemData.name && itemData.name.trim() !== '') {
            updatePayload.name = itemData.name;
        }

        if (itemData.price !== undefined) {
             const price = parseFloat(String(itemData.price));
             if(!isNaN(price)) updatePayload.price = price;
        }

        if (itemData.stock !== undefined) {
            const stock = parseInt(String(itemData.stock), 10);
            if(!isNaN(stock)) updatePayload.stock = stock;
        }
        
        if (Object.keys(updatePayload).length > 0) {
            const docRef = doc(firestore, 'bomboniere_items', id);
            updateDocumentNonBlocking(docRef, updatePayload);
            toast({ title: 'Sucesso!', description: 'Item atualizado.' });
        }
        
        setEditValues(prev => {
            const { [id]: _, ...rest } = prev;
            return rest;
        });
    };

    const handleAddNewItem = () => {
        if (!firestore || !bomboniereItemsQuery || !newItemName.trim() || !newItemPrice || !newItemStock) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos para adicionar um novo item.' });
            return;
        }
        const price = parseFloat(newItemPrice.replace(',', '.'));
        const stock = parseInt(newItemStock, 10);

        if (isNaN(price) || isNaN(stock)) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Preço e estoque devem ser números válidos.' });
            return;
        }
        
        const collectionRef = bomboniereItemsQuery.type === 'collection' ? bomboniereItemsQuery : bomboniereItemsQuery.converter ? bomboniereItemsQuery.withConverter(null) : bomboniereItemsQuery;


        const newItem: Omit<BomboniereItem, 'id'> = {
            name: newItemName.trim(),
            price,
            stock
        };

        addDocumentNonBlocking(collectionRef, newItem);
        toast({ title: 'Sucesso!', description: `${newItem.name} foi adicionado.` });

        setIsAdding(false);
        setNewItemName('');
        setNewItemPrice('');
        setNewItemStock('');
    };

    const confirmDelete = () => {
        if (!firestore || !itemToDelete) return;
        
        const docRef = doc(firestore, 'bomboniere_items', itemToDelete);
        deleteDocumentNonBlocking(docRef);
        toast({ title: 'Item Removido', description: 'O item foi removido permanentemente.' });
        setItemToDelete(null);
    };

     if (isLoading) {
        return (
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        );
    }
    
    if (error) {
        return (
            <div className="container mx-auto max-w-4xl p-8 text-center text-destructive">
                <h1 className="text-2xl font-bold">Erro ao Carregar Estoque</h1>
                <p>Não foi possível buscar os itens da bomboniere.</p>
                <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
                 <Link href="/" passHref>
                    <Button variant="outline" className="mt-4">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <>
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Essa ação não pode ser desfeita. Isso excluirá permanentemente o item selecionado.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <div className="container mx-auto max-w-2xl p-4 sm:p-8">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold">Controle de Estoque</h1>
                    <Link href="/" passHref>
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Voltar
                        </Button>
                    </Link>
                </div>
                
                <div className="mb-6">
                    {!isAdding ? (
                        <Button onClick={() => setIsAdding(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar Novo Item
                        </Button>
                    ) : (
                        <Card className="p-4">
                            <h3 className="font-semibold mb-2">Novo Item</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr,1fr] gap-2 items-end">
                               <Input 
                                   placeholder="Nome do item"
                                   value={newItemName}
                                   onChange={e => setNewItemName(e.target.value)}
                               />
                               <Input 
                                   placeholder="Preço (ex: 2.50)"
                                   value={newItemPrice}
                                   onChange={e => setNewItemPrice(e.target.value)}
                               />
                               <Input 
                                   placeholder="Estoque inicial"
                                   type="number"
                                   value={newItemStock}
                                   onChange={e => setNewItemStock(e.target.value)}
                               />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                               <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancelar</Button>
                               <Button onClick={handleAddNewItem}>Salvar Item</Button>
                            </div>
                        </Card>
                    )}
                </div>

                <ScrollArea className="h-[calc(100vh-20rem)]">
                    {bomboniereItems && bomboniereItems.length > 0 ? (
                        <div className="space-y-3 pr-4">
                            {bomboniereItems.map(item => {
                                const isEditing = !!editValues[item.id];
                                return (
                                <Card key={item.id}>
                                    <CardContent className="p-3 grid grid-cols-[1fr,auto] items-center gap-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr,1fr] gap-2 items-center">
                                            <Input 
                                                value={editValues[item.id]?.name ?? item.name}
                                                onChange={(e) => handleInputChange(item.id, 'name', e.target.value)}
                                                className="h-8 font-semibold"
                                            />
                                            <Input 
                                                value={editValues[item.id]?.price !== undefined ? String(editValues[item.id]?.price).replace('.',',') : String(item.price).replace('.',',')}
                                                onChange={(e) => handleInputChange(item.id, 'price', e.target.value)}
                                                className="h-8"
                                            />
                                            <Input
                                                type="number"
                                                value={editValues[item.id]?.stock ?? item.stock}
                                                onChange={(e) => handleInputChange(item.id, 'stock', e.target.value)}
                                                className={cn("h-8 font-bold", getStockColor(item.stock))}
                                            />
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-1">
                                            {isEditing && 
                                                <Button size="icon" className="h-8 w-8" onClick={() => handleSave(item.id)}>
                                                    <Save className="h-4 w-4" />
                                                </Button>
                                            }
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setItemToDelete(item.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-16">
                            <p>Nenhum item na bomboniere.</p>
                            <p className="text-sm mt-1">Adicione itens para começar a controlar o estoque.</p>
                        </div>
                    )}
                </ScrollArea>
            </div>
        </>
    );
}
