
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Save, Loader2, Search } from 'lucide-react';
import type { Fornecedor } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { collection, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
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

interface FornecedoresEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  fornecedores: Fornecedor[];
}

type EditableFornecedor = Fornecedor;

export default function FornecedoresEditModal({ isOpen, onClose, fornecedores: initialFornecedores }: FornecedoresEditModalProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [fornecedores, setFornecedores] = useState<EditableFornecedor[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fornecedorToDelete, setFornecedorToDelete] = useState<EditableFornecedor | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [originalNames, setOriginalNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const sorted = [...initialFornecedores].sort((a,b) => a.nome.localeCompare(b.nome));
      setFornecedores(sorted);
      setOriginalNames(Object.fromEntries(sorted.map(f => [f.id, f.nome])));
      setSearchTerm("");
    }
  }, [isOpen, initialFornecedores]);

  const filteredFornecedores = useMemo(() => {
    if (!searchTerm) return fornecedores;
    
    return fornecedores.filter(f => f.nome.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [fornecedores, searchTerm]);


  const handleNameChange = (id: string, newName: string) => {
    setFornecedores(prev => prev.map(f => f.id === id ? {...f, nome: newName} : f));
  };

  const handleDeleteRequest = (fornecedor: EditableFornecedor) => {
      setFornecedorToDelete(fornecedor);
  }

  const confirmDelete = () => {
      if (!firestore || !fornecedorToDelete || !fornecedorToDelete.id) return;
      // You cannot delete the delivery fees provider
      if(fornecedorToDelete.id === 'delivery_fees_provider') {
        toast({ variant: 'destructive', title: "Ação não permitida", description: "Não pode apagar o fornecedor de taxas de entrega."});
        setFornecedorToDelete(null);
        return;
      }
      const docRef = doc(firestore, 'fornecedores', fornecedorToDelete.id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Sucesso", description: `"${fornecedorToDelete.nome}" foi removido.`});
      setFornecedorToDelete(null);
  }

  const handleSaveAll = async () => {
      if (!firestore) return;
      setIsProcessing(true);

      const fornecedoresCollectionRef = collection(firestore, "fornecedores");
      let hasError = false;

      for (const fornecedor of fornecedores) {
          const originalName = originalNames[fornecedor.id];
          if (fornecedor.nome !== originalName) {
            if (!fornecedor.nome.trim()) {
                toast({ variant: 'destructive', title: 'Erro de Validação', description: `O fornecedor com o nome original "${originalName}" não pode ter um nome em branco.`});
                hasError = true;
                break;
            }
            const docRef = doc(fornecedoresCollectionRef, fornecedor.id);
            updateDocumentNonBlocking(docRef, { nome: fornecedor.nome.trim() });
          }
      }
      
      setIsProcessing(false);
      
      if (!hasError) {
        toast({ title: "Sucesso", description: "Fornecedores atualizados." });
        onClose();
      }
  };
  

  return (
    <>
      <AlertDialog open={!!fornecedorToDelete} onOpenChange={(open) => !open && setFornecedorToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O fornecedor "{fornecedorToDelete?.nome}" será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
            <DialogHeader>
                <DialogTitle className="text-center">Gerir Fornecedores</DialogTitle>
            </DialogHeader>
            
            <div className="relative px-2">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar fornecedor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                />
            </div>

            <ScrollArea className="h-80 -mx-6">
              <div className="px-6 divide-y divide-border">
                {filteredFornecedores.map((fornecedor) => (
                    <div key={fornecedor.id} className="flex items-center gap-x-4 py-2">
                        <Input
                            value={fornecedor.nome}
                            onChange={(e) => handleNameChange(fornecedor.id, e.target.value)}
                            placeholder="Nome do Fornecedor"
                            className="flex-grow"
                            disabled={fornecedor.id === 'delivery_fees_provider'}
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleDeleteRequest(fornecedor)}
                             disabled={fornecedor.id === 'delivery_fees_provider'}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
              </div>
            </ScrollArea>

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
