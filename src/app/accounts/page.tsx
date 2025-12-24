
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc, deleteDoc } from 'firebase/firestore';
import type { Item as ClientAccountEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Trash2, User, Package, Utensils, CalendarDays, ReceiptText } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';


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
    });
};

const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

const formatOriginalCommand = (command: string = "") => {
    return command.split(' ').map(part => {
        // Check if the part is a number or a number with a comma
        const isNumeric = /^[0-9]+(,[0-9]{1,2})?$/.test(part);
        if (isNumeric) {
            let num = parseFloat(part.replace(',', '.'));
            return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return part;
    }).join(' ');
}


function EntryItems({ entry }: { entry: ClientAccountEntry }) {
    return (
      <div className="flex flex-wrap gap-2">
        {entry.predefinedItems && entry.predefinedItems.map((item, idx) => (
            <div key={`pre-${idx}`} className="flex flex-col items-center">
                <Badge variant="secondary">{item.name}</Badge>
                <span className="text-xs text-muted-foreground">{formatCurrency(item.price)}</span>
            </div>
        ))}
        {entry.individualPrices && entry.individualPrices.map((price, idx) => (
            <div key={`kg-${idx}`} className="flex flex-col items-center">
                <Badge variant="secondary">KG</Badge>
                <span className="text-xs text-muted-foreground">{formatCurrency(price)}</span>
            </div>
        ))}
        {entry.bomboniereItems && entry.bomboniereItems.map((item, idx) => (
          <div key={`bom-${idx}`} className="flex flex-col items-center">
            <Badge variant="outline">
                {item.quantity > 1 && `${item.quantity}x `}{item.name}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatCurrency(item.price)}</span>
          </div>
        ))}
      </div>
    );
}

function ClientDetail({ client, onBack, onClear }: { client: { id: string; name: string }, onBack: () => void, onClear: (clientId: string) => void }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

    const accountEntriesQuery = useMemoFirebase(
        () => (firestore && user ? query(
            collection(firestore, 'order_items'),
            where('userId', '==', user.uid),
            where('customerId', '==', client.id),
            where('group', 'in', ['Fiados salão', 'Fiados rua'])
        ) : null),
        [firestore, user, client.id]
    );

    const { data: entries, isLoading, error } = useCollection<ClientAccountEntry>(accountEntriesQuery);

    const sortedEntries = useMemo(() => {
        if (!entries) return [];
        return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [entries]);

    const totalDebt = useMemo(() => entries?.reduce((sum, entry) => sum + entry.total, 0) || 0, [entries]);
    
    const handleClearConfirm = () => {
        if (!entries || !firestore || !user) return;
        
        const orderItemsCollectionRef = collection(firestore, "order_items");
        entries.forEach(entry => {
            const docRef = doc(orderItemsCollectionRef, entry.id);
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
                  Esta ação é irreversível. Todos os lançamentos de {client.name} serão apagados permanentemente.
                  Isso é geralmente feito após o pagamento da conta mensal.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearConfirm}>Confirmar e Limpar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="container mx-auto max-w-4xl p-4 sm:p-8">
            <div className="flex items-center justify-between mb-4">
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
                <CardHeader className="flex flex-row items-center justify-between p-4">
                    <CardTitle className="text-lg">Dívida Total</CardTitle>
                    <p className="text-3xl font-bold text-destructive">{formatCurrency(totalDebt)}</p>
                </CardHeader>
                <CardFooter className="p-4 border-t">
                    <Button variant="destructive" onClick={() => setIsClearConfirmOpen(true)} disabled={!entries || entries.length === 0}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Zerar Caderneta
                    </Button>
                </CardFooter>
            </Card>

            <Card>
                <CardHeader className="p-4">
                     <CardTitle className="text-lg flex items-center gap-2">
                        <ReceiptText className="h-5 w-5 text-muted-foreground" />
                        Lançamentos
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                 {sortedEntries && sortedEntries.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]"><CalendarDays className="inline-block mr-1 h-4 w-4" />Data</TableHead>
                                <TableHead>Itens</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {sortedEntries.map(entry => (
                            <TableRow key={entry.id}>
                                <TableCell className="font-medium align-top">
                                    <div className="flex flex-col">
                                        <span>{formatDate(entry.timestamp)}</span>
                                        <span className="text-xs text-muted-foreground">{formatTime(entry.timestamp)}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="align-top max-w-[250px]">
                                    <EntryItems entry={entry} />
                                    <p className="text-xs text-muted-foreground mt-1 truncate italic">"{formatOriginalCommand(entry.originalCommand)}"</p>
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold align-top">
                                    {formatCurrency(entry.total)}
                                    {entry.deliveryFee && entry.deliveryFee > 0 ? (
                                        <p className="text-xs text-muted-foreground font-sans font-normal">({formatCurrency(entry.deliveryFee)} entrega)</p>
                                    ) : null}
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center text-muted-foreground p-16">
                        <p>Nenhum lançamento encontrado para este cliente.</p>
                    </div>
                )}
                </CardContent>
            </Card>
        </div>
        </>
    )
}

export default function AccountsPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  
  const fiadoItemsQuery = useMemoFirebase(
    () => (firestore && user ? query(
        collection(firestore, 'order_items'), 
        where('userId', '==', user.uid),
        where('group', 'in', ['Fiados salão', 'Fiados rua'])
    ) : null),
    [firestore, user]
  );
  
  const { data: allFiadoEntries, isLoading } = useCollection<ClientAccountEntry>(fiadoItemsQuery);

  const clientsWithAccounts = useMemo(() => {
    if (!allFiadoEntries) return [];

    const accountsByCustomer = allFiadoEntries.reduce((acc, entry) => {
        if (!entry.customerId || !entry.customerName) return acc;

        if (!acc[entry.customerId]) {
            acc[entry.customerId] = {
                id: entry.customerId,
                name: entry.customerName,
                totalDebt: 0
            };
        }
        acc[entry.customerId].totalDebt += entry.total;
        return acc;
    }, {} as Record<string, { id: string, name: string, totalDebt: number }>);
    
    return Object.values(accountsByCustomer).sort((a,b) => a.name.localeCompare(b.name));

  }, [allFiadoEntries]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedClient) {
    return <ClientDetail 
        client={selectedClient} 
        onBack={() => setSelectedClient(null)} 
        onClear={(clearedId) => {
            if (selectedClient?.id === clearedId) {
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
              <CardHeader className="flex flex-row justify-between items-center p-4">
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

    