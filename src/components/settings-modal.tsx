
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { useToast } from "@/hooks/use-toast";
import type { FavoriteClient } from '@/types';
import { useFirestore } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Trash2 } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  favoriteClients: FavoriteClient[];
}

export default function SettingsModal({ isOpen, onClose, favoriteClients }: SettingsModalProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const handleClearFavorites = () => {
    if (!firestore || !favoriteClients) return;

    try {
      favoriteClients.forEach(client => {
        const docRef = doc(firestore, "favorite_clients", client.id);
        deleteDocumentNonBlocking(docRef);
      });
      toast({
        title: "Sucesso",
        description: "Todos os favoritos foram apagados.",
      });
    } catch (error) {
      console.error("Error clearing favorites:", error);
      toast({
        variant: "destructive",
        title: "Erro ao limpar favoritos",
        description: "Ocorreu um problema ao apagar os clientes favoritos.",
      });
    } finally {
        setIsClearConfirmOpen(false);
        onClose();
    }
  };

  return (
    <>
     <AlertDialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Isso excluirá permanentemente todos os seus clientes favoritos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearFavorites}>Confirmar Exclusão</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações</DialogTitle>
            <DialogDescription>
              Gerencie as configurações e dados do seu aplicativo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Zona de Perigo</h3>
              <div className="p-4 border border-destructive/50 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-medium">Limpar Clientes Favoritos</p>
                  <p className="text-xs text-muted-foreground">
                    Remove todos os clientes salvos para lançamentos rápidos.
                  </p>
                </div>
                <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setIsClearConfirmOpen(true)}
                    disabled={favoriteClients.length === 0}
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Zerar Favoritos
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Fechar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
