
'use client';

import { useState, useRef, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FavoriteClient } from '@/types';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';


interface ManageFavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  favoriteClients: FavoriteClient[];
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

export default function ManageFavoritesModal({ isOpen, onClose, favoriteClients }: ManageFavoritesModalProps) {
  const firestore = useFirestore();
  const favoriteClientsRef = useMemoFirebase(() => collection(firestore, 'favorite_clients'), [firestore]);

  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingClient, setEditingClient] = useState<FavoriteClient | null>(null);

  const addFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  
  useEffect(() => {
    if(!isOpen) {
        setIsAdding(false);
        setEditingClient(null);
    }
  }, [isOpen]);

  const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!firestore) return;

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const orderDescription = formData.get('orderDescription') as string;
    const price = parseFloat((formData.get('price') as string || '0').replace(',', '.'));
    
    if (!name || !orderDescription || isNaN(price) || price <= 0) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }

    if (isAdding) {
      const newClient: Omit<FavoriteClient, 'id'> = {
        name,
        orderDescription,
        price,
      };
      addDocumentNonBlocking(favoriteClientsRef, newClient);
      setIsAdding(false);
    } else if (editingClient) {
      const docRef = doc(firestore, 'favorite_clients', editingClient.id);
      updateDocumentNonBlocking(docRef, { name, orderDescription, price });
      setEditingClient(null);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setClientToDelete(id);
  };

  const confirmDelete = () => {
    if (clientToDelete && firestore) {
      const docRef = doc(firestore, 'favorite_clients', clientToDelete);
      deleteDocumentNonBlocking(docRef);
      setClientToDelete(null);
    }
  };
  
  const handleCancelEdit = () => {
      setEditingClient(null);
  }
  
  const sortedClients = [...favoriteClients].sort((a,b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Essa ação não pode ser desfeita. Isso excluirá permanentemente o cliente dos seus favoritos.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <DialogHeader>
          <DialogTitle>Gerenciar Clientes Favoritos</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-80 -mx-6 px-6">
          <div className="space-y-3">
            {sortedClients.map(client => (
              editingClient?.id === client.id ? (
                <form key={client.id} ref={editFormRef} onSubmit={handleSaveItem} className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor={`edit-name-${client.id}`}>Nome do Cliente</Label>
                        <Input id={`edit-name-${client.id}`} name="name" defaultValue={client.name} required />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`edit-desc-${client.id}`}>Descrição do Pedido</Label>
                        <Input id={`edit-desc-${client.id}`} name="orderDescription" defaultValue={client.orderDescription} required />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`edit-price-${client.id}`}>Preço Fixo (R$)</Label>
                        <Input id={`edit-price-${client.id}`} name="price" type="text" defaultValue={String(client.price).replace('.',',')} required />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>Cancelar</Button>
                        <Button type="submit" size="sm"><Save className="h-4 w-4 mr-2" /> Salvar</Button>
                    </div>
                </form>
              ) : (
                <Card key={client.id}>
                    <CardContent className="p-3 flex items-center">
                        <div className="flex-grow">
                            <p className="font-semibold">{client.name}</p>
                            <p className="text-sm text-muted-foreground">{client.orderDescription}</p>
                            <p className="text-sm font-bold text-primary">{formatCurrency(client.price)}</p>
                        </div>
                        <div className="flex">
                            <Button variant="ghost" size="icon" onClick={() => setEditingClient(client)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRequest(client.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                    </CardContent>
                </Card>
              )
            ))}

            {isAdding && (
                <form ref={addFormRef} onSubmit={handleSaveItem} className="p-4 bg-muted/50 rounded-lg space-y-3 mt-4">
                    <h3 className="font-semibold text-center">Adicionar Novo Cliente</h3>
                     <div className="space-y-1">
                        <Label htmlFor="add-name">Nome do Cliente</Label>
                        <Input id="add-name" name="name" placeholder="Ex: João da Silva" required autoFocus/>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="add-desc">Descrição do Pedido</Label>
                        <Input id="add-desc" name="orderDescription" placeholder="Ex: PF com suco" required />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="add-price">Preço Fixo (R$)</Label>
                        <Input id="add-price" name="price" placeholder="Ex: 25,50" required />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancelar</Button>
                        <Button type="submit" size="sm"><Save className="h-4 w-4 mr-2" /> Salvar Cliente</Button>
                    </div>
                </form>
            )}

          </div>
        </ScrollArea>
        
        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="outline" className="w-full" onClick={() => { setIsAdding(prev => !prev); setEditingClient(null); }} disabled={isAdding || !!editingClient}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Novo
          </Button>
          <DialogClose asChild>
            <Button className="w-full">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
