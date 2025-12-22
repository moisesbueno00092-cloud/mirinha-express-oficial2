
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import type { ClientAccountEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2, User } from 'lucide-react';
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
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from "@/hooks/use-toast";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
};

function ClientDetail({ client, onBack, onClear }: { client: { id: string; name: string }, onBack: () => void, onClear: (clientId: string) => void }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

    const accountEntriesQuery = useMemoFirebase(
        () => (firestore ? query(
            collection(firestore, 'client_accounts'),
            where('customerId', '==', client.id),
            orderBy('timestamp', 'desc')
        ) : null),
        [firestore, client.id]
    );
    const { data: entries, isLoading, error } = useCollection<ClientAccountEntry>(accountEntriesQuery);

    const totalDebt = useMemo(() => entries?.reduce((sum, entry) => sum + entry.price, 0) || 0, [entries]);
    
    const handleClearConfirm = () => {
        if (!entries || !firestore) return;
        
        entries.forEach(entry => {
            const docRef = doc(firestore, 'client_accounts', entry.id);
            deleteDocumentNonBlocking(docRef);
        });

        toast({
            title: "Caderneta Limpa!",
            description: `Todos os registros de ${client.name} foram apagados.`
        });
        
        onClear(client.id); // Notify parent
        setIsClearConfirmOpen(false);
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
            <div className="text-center text-destructive p-8">
                <h1 className="text-xl font-bold">Erro ao buscar registros.</h1>
                <p>{error.message}</p>
                <Button variant="outline" className="mt-4" onClick={onBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
            </div>
        );
    }

    return (
        <>
        <AlertDialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar Caderneta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é irreversível. Todos os lançamentos de {client.name} serão apagados.
                  Isso é geralmente feito após o pagamento da conta mensal.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearConfirm}>Confirmar e Limpar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="container mx-auto max-w-2xl p-4 sm:p-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold truncate">{client.name}</h1>
                    <p className="text-muted-foreground">Extrato da Caderneta</p>
                </div>
                <Button variant="outline" onClick={onBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-lg">Dívida Total</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold text-destructive">{formatCurrency(totalDebt)}</p>
                </CardContent>
                <CardFooter>
                    <Button variant="destructive" onClick={() => setIsClearConfirmOpen(true)} disabled={!entries || entries.length === 0}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Zerar Caderneta
                    </Button>
                </CardFooter>
            </Card>

            <h2 className="text-xl font-semibold mb-4">Lançamentos</h2>
            {entries && entries.length > 0 ? (
                <div className="space-y-3">
                    {entries.map(entry => (
                        <Card key={entry.id}>
                            <CardContent className="p-3 flex justify-between items-center text-sm">
                                <div>
                                    <p className="font-semibold">{entry.description}</p>
                                    <p className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</p>
                                </div>
                                <p className="font-mono font-semibold text-destructive">{formatCurrency(entry.price)}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center text-muted-foreground py-16">
                    <p>Nenhum lançamento encontrado para este cliente.</p>
                </div>
            )}
        </div>
        </>
    )
}

export default function AccountsPage() {
  const firestore = useFirestore();
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  
  const clientAccountsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'client_accounts') : null),
    [firestore]
  );
  
  const { data: allAccountEntries, isLoading } = useCollection<ClientAccountEntry>(clientAccountsQuery);

  const clientsWithAccounts = useMemo(() => {
    if (!allAccountEntries) return [];

    const accountsByCustomer = allAccountEntries.reduce((acc, entry) => {
        if (!acc[entry.customerId]) {
            acc[entry.customerId] = {
                id: entry.customerId,
                name: entry.customerName,
                totalDebt: 0
            };
        }
        acc[entry.customerId].totalDebt += entry.price;
        return acc;
    }, {} as Record<string, { id: string, name: string, totalDebt: number }>);
    
    return Object.values(accountsByCustomer).sort((a,b) => a.name.localeCompare(b.name));

  }, [allAccountEntries]);

  if (selectedClient) {
    return <ClientDetail 
        client={selectedClient} 
        onBack={() => setSelectedClient(null)} 
        onClear={(clearedId) => {
            if (selectedClient.id === clearedId) {
                setSelectedClient(null);
            }
        }}
    />
  }

  return (
    <div className="container mx-auto max-w-2xl p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Caderneta de Clientes</h1>
        <Link href="/" passHref>
            <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
            </Button>
        </Link>
      </div>

      {isLoading ? (
         <div className="flex justify-center items-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
         </div>
      ) : clientsWithAccounts && clientsWithAccounts.length > 0 ? (
        <div className="space-y-4">
          {clientsWithAccounts.map((client) => (
            <Card 
                key={client.id} 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setSelectedClient(client)}
            >
              <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle className="text-lg sm:text-xl flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  {client.name}
                </CardTitle>
                <div className="text-right">
                    <p className="text-sm text-muted-foreground">Dívida</p>
                    <p className="font-bold text-destructive">{formatCurrency(client.totalDebt)}</p>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-16">
          <p>Nenhum cliente com "fiado" encontrado.</p>
          <p className="text-xs mt-2">Os clientes aparecerão aqui quando você fizer um lançamento "fiado" para eles.</p>
        </div>
      )}
    </div>
  );
}
