
'use client';

import { useState, useEffect } from 'react';
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

export default function ManageFavoritesModal({ isOpen, onClose, favoriteClients }: ManageFavoritesModalProps) {
  const firestore = useFirestore();
  const favoriteClientsRef = useMemoFirebase(() => collection(firestore, 'favorite_clients'), [firestore]);

  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingClient, setEditingClient] = useState<FavoriteClient | null>(null);

  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      setIsAdding(false);
      setEditingClient(null);
      setClientToDelete(null);
      setNewName('');
      setNewCommand('');
    }
  }, [isOpen]);

  const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!firestore) return;

    if (isAdding) {
      if (!newName || !newCommand) return;
      addDocumentNonBlocking(favoriteClientsRef, { name: newName, command: newCommand });
      setIsAdding(false);
      setNewName('');
      setNewCommand('');
    } else if (editingClient) {
      if (!newName || !newCommand) return;
      const docRef = doc(firestore, 'favorite_clients', editingClient.id);
      updateDocumentNonBlocking(docRef, { name: newName, command: newCommand });
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
  
  const handleEditClick = (client: FavoriteClient) => {
      setEditingClient(client);
      setNewName(client.name);
      setNewCommand(client.command);
      setIsAdding(false);
  }

  const handleAddNewClick = () => {
      setIsAdding(true);
      setEditingClient(null);
      setNewName('');
      setNewCommand('');
  }
  
  const handleCancel = () => {
      setIsAdding(false);
      setEditingClient(null);
  }
  
  const sortedClients = [...favoriteClients].sort((a,b) => a.name.localeCompare(b.name));

  const renderClientList = () => (
    <div className="space-y-3">
        {sortedClients.map(client => (
            <Card key={client.id}>
                <CardContent className="p-3 flex items-center">
                    <div className="flex-grow">
                        <p className="font-semibold">{client.name}</p>
                        <p className="text-sm text-muted-foreground font-mono">{client.command}</p>
                    </div>
                    <div className="flex">
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(client)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRequest(client.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                </CardContent>
            </Card>
        ))}
    </div>
  );

  const renderForm = () => (
     <form onSubmit={handleSaveItem} className="p-4 bg-muted/50 rounded-lg space-y-3 mt-4">
        <h3 className="font-semibold text-center">{isAdding ? "Adicionar Novo Cliente" : "Editar Cliente"}</h3>
         <div className="space-y-1">
            <Label htmlFor="add-name">Nome do Cliente</Label>
            <Input id="add-name" name="name" placeholder="Ex: João da Silva" required autoFocus value={newName} onChange={e => setNewName(e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="add-command">Comando de Lançamento</Label>
            <Input id="add-command" name="command" placeholder="Ex: PF coquinha" required value={newCommand} onChange={e => setNewCommand(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>Cancelar</Button>
            <Button type="submit" size="sm"><Save className="h-4 w-4 mr-2" /> Salvar</Button>
        </div>
    </form>
  );


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
          {isAdding || editingClient ? renderForm() : renderClientList()}
        </ScrollArea>
        
        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="outline" className="w-full" onClick={handleAddNewClick} disabled={isAdding || !!editingClient}>
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
