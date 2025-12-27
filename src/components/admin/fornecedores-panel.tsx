
'use client';

import { useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Fornecedor } from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { doc } from 'firebase/firestore';


export default function FornecedoresPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [newFornecedorName, setNewFornecedorName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fornecedorToDelete, setFornecedorToDelete] = useState<Fornecedor | null>(null);

    const fornecedoresQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null,
        [firestore]
    );

    const { data: fornecedores, isLoading } = useCollection<Fornecedor>(fornecedoresQuery);

    const handleAddFornecedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !newFornecedorName.trim()) return;

        setIsSubmitting(true);
        try {
            await addDocumentNonBlocking(collection(firestore, 'fornecedores'), {
                nome: newFornecedorName.trim(),
            });
            toast({ title: 'Sucesso', description: 'Fornecedor adicionado.' });
            setNewFornecedorName('');
        } catch (error) {
            console.error("Erro ao adicionar fornecedor: ", error);
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível adicionar o fornecedor.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteRequest = (fornecedor: Fornecedor) => {
        setFornecedorToDelete(fornecedor);
    }
    
    const confirmDelete = () => {
        if(!firestore || !fornecedorToDelete) return;
        deleteDocumentNonBlocking(doc(firestore, "fornecedores", fornecedorToDelete.id));
        toast({
          title: "Sucesso",
          description: `Fornecedor "${fornecedorToDelete.name}" removido.`,
        });
        setFornecedorToDelete(null);
    };

    return (
        <div className="space-y-6">
            <AlertDialog open={!!fornecedorToDelete} onOpenChange={(open) => !open && setFornecedorToDelete(null)}>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                    Essa ação não pode ser desfeita. Isso excluirá permanentemente o fornecedor.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <form onSubmit={handleAddFornecedor} className="flex items-center gap-2">
                <Input
                    placeholder="Nome do novo fornecedor"
                    value={newFornecedorName}
                    onChange={(e) => setNewFornecedorName(e.target.value)}
                    disabled={isSubmitting}
                />
                <Button type="submit" disabled={isSubmitting || !newFornecedorName.trim()}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                    <span className="ml-2 hidden sm:inline">Adicionar</span>
                </Button>
            </form>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome do Fornecedor</TableHead>
                            <TableHead className="text-right w-24">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : fornecedores && fornecedores.length > 0 ? (
                            fornecedores.map((fornecedor) => (
                                <TableRow key={fornecedor.id}>
                                    <TableCell className="font-medium">{fornecedor.nome}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteRequest(fornecedor)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                                    Nenhum fornecedor encontrado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
