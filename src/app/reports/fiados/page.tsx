
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft, User, Info, Users, ShieldX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import PasswordDialog from '@/components/password-dialog';

import type { Item } from '@/types';
import { MonthYearPicker } from '@/components/ui/month-year-picker';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};


function FiadosPageContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [fiadoItems, setFiadoItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  
  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
        try {
            const sessionAuth = sessionStorage.getItem('admin-authenticated');
            if (sessionAuth === 'true') {
                setIsAuthenticated(true);
            }
        } catch (e) {
            console.error("Could not read sessionStorage:", e);
        } finally {
            setIsAuthChecked(true);
        }
    }
  }, []);

  const handleAuthSuccess = () => {
    try {
        sessionStorage.setItem('admin-authenticated', 'true');
    } catch (e) {
        console.error("Could not write to sessionStorage:", e);
    }
    setIsAuthenticated(true);
  }

  const fetchFiadoItems = useCallback(async () => {
    if (!firestore || !user) return;
    setIsLoading(true);

    try {
        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);

        const queries = [
            // Global Collections
            query(collection(firestore, 'live_items'), 
                where('group', 'in', ['Fiados salão', 'Fiados rua']),
                where('timestamp', '>=', start),
                where('timestamp', '<=', end)
            ),
            query(collection(firestore, 'order_items'), 
                where('group', 'in', ['Fiados salão', 'Fiados rua']),
                where('timestamp', '>=', start),
                where('timestamp', '<=', end)
            ),
            // User-specific (old) collections
            query(collection(firestore, 'users', user.uid, 'live_items'),
                where('group', 'in', ['Fiados salão', 'Fiados rua']),
                where('timestamp', '>=', start),
                where('timestamp', '<=', end)
            ),
            query(collection(firestore, 'users', user.uid, 'order_items'),
                where('group', 'in', ['Fiados salão', 'Fiados rua']),
                where('timestamp', '>=', start),
                where('timestamp', '<=', end)
            )
        ];
        
        const snapshots = await Promise.all(queries.map(q => getDocs(q)));

        const allFiadosMap = new Map<string, Item>();
        snapshots.forEach(snapshot => {
            snapshot.forEach((doc) => {
                allFiadosMap.set(doc.id, { ...doc.data(), id: doc.id } as Item);
            });
        });
        
        const allFiados = Array.from(allFiadosMap.values())
            .sort((a, b) => a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime());
        
        setFiadoItems(allFiados);

    } catch (error) {
        console.error("Error fetching fiado items:", error);
        toast({
            variant: "destructive",
            title: "Erro ao buscar fiados",
            description: "Não foi possível carregar os itens fiados. Verifique a sua conexão e as regras de segurança."
        });
    } finally {
        setIsLoading(false);
    }
  }, [firestore, user, selectedMonth, toast]);

  useEffect(() => {
    if(isAuthenticated) {
        fetchFiadoItems();
    }
  }, [isAuthenticated, fetchFiadoItems]);

  const aggregatedFiados = useMemo(() => {
    const byCustomer = fiadoItems.reduce((acc, item) => {
        const customerName = item.customerName || 'Cliente Desconhecido';
        if (!acc[customerName]) {
            acc[customerName] = { total: 0, items: [] };
        }
        acc[customerName].total += item.total;
        acc[customerName].items.push(item);
        return acc;
    }, {} as Record<string, { total: number, items: Item[] }>);
    
    return Object.entries(byCustomer)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a,b) => b.total - a.total);

  }, [fiadoItems]);
  
  if (!isAuthChecked || isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
            <h2 className="text-center text-2xl font-bold mb-2 flex items-center justify-center gap-2"><ShieldX className="h-7 w-7 text-destructive"/> Acesso Restrito</h2>
            <p className="text-center text-muted-foreground mb-6">Esta secção requer uma senha para aceder.</p>
            <PasswordDialog 
                open={true}
                onOpenChange={(isOpen) => { if(!isOpen) router.push('/reports'); }}
                onSuccess={handleAuthSuccess}
                showCancel={true}
            />
        </div>
      </div>
    )
  }


  return (
    <>
      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/reports" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Controle de Fiados</h1>
              <p className="text-muted-foreground">Consulte os valores pendentes por cliente para o mês selecionado.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MonthYearPicker date={selectedMonth} setDate={(date) => date && setSelectedMonth(date)} />
          </div>
        </header>

        <main className="space-y-6">
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            ) : aggregatedFiados.length === 0 ? (
                 <Card>
                    <CardContent className="p-10 text-center text-muted-foreground">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum fiado encontrado para o mês de {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}.</p>
                    </CardContent>
                </Card>
            ) : (
                aggregatedFiados.map(customer => (
                    <Card key={customer.name}>
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5 text-muted-foreground"/>
                                {customer.name}
                            </CardTitle>
                            <div className="text-right">
                                <CardDescription>Total Pendente</CardDescription>
                                <p className="text-2xl font-bold text-destructive">{formatCurrency(customer.total)}</p>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Separator className="mb-4"/>
                            <div className="space-y-2">
                                {customer.items.map(item => (
                                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-muted/50">
                                        <div>
                                            <p className="font-semibold">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">{format(item.timestamp.toDate(), "dd/MM/yyyy 'às' HH:mm")}</p>
                                        </div>
                                        <p className="font-mono font-semibold">{formatCurrency(item.total)}</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}
        </main>
      </div>
    </>
  );
}

export default function FiadosPage() {
    return (
        <FiadosPageContent />
    )
}

    