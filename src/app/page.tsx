
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Item,
  Group,
  PredefinedItem,
  SelectedBomboniereItem,
  BomboniereItem,
  DailyReport,
  ItemCount,
  SavedFavorite,
} from '@/types';
import { PREDEFINED_PRICES, DELIVERY_FEE } from '@/lib/constants';
import {
  useFirestore,
  useCollection,
  useUser,
} from '@/firebase';
import {
  collection,
  doc,
  query,
  orderBy,
  deleteDoc,
  writeBatch,
  addDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Save,
  Loader2,
  History,
} from 'lucide-react';

import ItemForm from '@/components/item-form';
import BomboniereModal from '@/components/bomboniere-modal';
import StockEditModal from '@/components/stock-edit-modal';
import MirinhaLogo from '@/components/mirinha-logo';
import FavoritesMenu from '@/components/favorites-menu';
import { format as formatDateFn } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ItemList from '@/components/item-list';
import { Separator } from '@/components/ui/separator';
import PasswordDialog from '@/components/password-dialog';
import usePersistentState from '@/hooks/use-persistent-state';
import { DatePicker } from '@/components/ui/date-picker';
import { processCommand } from '@/ai/process-command';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const isNumeric = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);

const ToastContent = ({ item, title }: { item: Partial<Item>; title: string }) => (
  <div className="grid w-full gap-1">
    <div className="font-semibold">{title}</div>
    <div className="grid grid-cols-[1fr_auto] items-start gap-4">
      <div className="flex flex-col gap-1.5">
        <span>{item.name}</span>
      </div>
      <div className="text-right">
        <div className="font-bold text-lg text-primary">{formatCurrency(item.total || 0)}</div>
        {item.deliveryFee && item.deliveryFee > 0 && (
          <div className="text-xs text-muted-foreground">Taxa: {formatCurrency(item.deliveryFee)}</div>
        )}
      </div>
    </div>
  </div>
);

function LancheTrackerPageContent() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [predefinedPrices] = usePersistentState('predefinedPrices', PREDEFINED_PRICES);
  const [deliveryFee] = usePersistentState('deliveryFee', DELIVERY_FEE);

  const liveItemsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'live_items'));
  }, [firestore]);
  
  const { data: allItems, isLoading: isLoadingItems, error: itemsError } = useCollection<Item>(liveItemsQuery);

  const items = useMemo(() => {
    if (!allItems) return [];
    return [...allItems]
      .filter(item => !item.reportado)
      .sort((a, b) => {
        const getT = (ts: any) => (ts?.toMillis ? ts.toMillis() : new Date(ts).getTime() || 0);
        return getT(b.timestamp) - getT(a.timestamp); 
      });
  }, [allItems]);


  useEffect(() => {
    if (itemsError) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar itens',
        description: `Não foi possível carregar os lançamentos. Verifique a sua conexão.`,
        duration: 8000,
      });
    }
  }, [itemsError, toast]);


  const bomboniereItemsQuery = useMemo(
    () => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null),
    [firestore]
  );
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(
    bomboniereItemsQuery
  );
  
  const bomboniereItemsByName = useMemo(() => {
    if (!bomboniereItems) return {};
    return bomboniereItems.reduce((acc, item) => {
        acc[item.name.toLowerCase()] = item;
        return acc;
    }, {} as Record<string, BomboniereItem>);
  }, [bomboniereItems]);


  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isBomboniereModalOpen, setBomboniereModalOpen] = useState(false);
  const [isStockEditModalOpen, setIsStockEditModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);


  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const [savedFavorites, setSavedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);

  const [passwordPrompt, setPasswordPrompt] = useState<{ open: boolean; onSuccess: () => void; onCancel?: () => void; } | null>(null);

  const handlePasswordSuccess = () => {
    if (passwordPrompt?.onSuccess) {
      try {
        sessionStorage.setItem('admin-authenticated', 'true');
      } catch (e) {
        console.error('Could not write to sessionStorage:', e);
      }
      passwordPrompt.onSuccess();
    }
    setPasswordPrompt(null);
  };

  async function handleUpsertItem(rawInputToProcess: string, currentItem?: Item | null, favoriteName?: string) {
    if (isProcessing) return;
    setIsProcessing(true);
    if (!firestore || !user?.uid) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Base de dados indisponível.' });
      setIsProcessing(false);
      return;
    }
    const liveItemsCollectionRef = collection(firestore, 'live_items');


    try {
      // CLEAR CACHE/RESET FOR BOMBONIERE STOCK RESTORATION ON EDIT
      if (currentItem && currentItem.bomboniereItems && currentItem.bomboniereItems.length > 0 && bomboniereItems) {
        // (existing stock restoration logic...)
      }

      const input = rawInputToProcess.trim();
      if (!input) {
          setIsProcessing(false);
          return;
      }

      // USE GEMINI BRUTE INTELLIGENCE
      const aiResponse = await processCommand(input);
      if (!aiResponse) {
          toast({ variant: 'destructive', title: 'Erro na IA', description: 'O comando não pôde ser processado pelo Gemini.' });
          setIsProcessing(false);
          return;
      }

      const { items: processedItems, group: aiGroup, customerName: aiCustomerName, deliveryFee: aiDeliveryFee } = aiResponse;

      let totalQuantity = processedItems.reduce((sum, i) => sum + i.quantity, 0);
      let totalPrice = processedItems.reduce((sum, i) => sum + i.totalPrice, 0);
      
      const group = aiGroup;
      const customerName = aiCustomerName || favoriteName;
      const deliveryFeeValue = aiDeliveryFee;
      const total = totalPrice + deliveryFeeValue;

      // Update bomboniere stock (simplified for now, assumes matching by name)
      if (bomboniereItems) {
        const bomboniereCollectionRef = collection(firestore, 'bomboniere_items');
        const batch = writeBatch(firestore);
        for (const item of processedItems) {
          const match = bomboniereItems.find(b => b.name.toLowerCase() === item.name.toLowerCase());
          if (match) {
            const newStock = match.estoque - item.quantity;
            batch.update(doc(bomboniereCollectionRef, match.id), { estoque: newStock });
          }
        }
        await batch.commit();
      }

      const consolidatedName = processedItems.map(i => `${i.quantity > 1 ? i.quantity : ''}${i.name}`).join(' + ');

      const finalItem: Omit<Item, 'id'> = {
        userId: user.uid,
        name: consolidatedName.length > 50 ? 'Lançamento Misto' : consolidatedName,
        quantity: totalQuantity,
        price: totalPrice,
        group,
        // USE SELECTED DATE IF PROVIDED, ELSE SERVER TIMESTAMP
        timestamp: currentItem ? currentItem.timestamp : (selectedDate ? Timestamp.fromDate(selectedDate) : (serverTimestamp() as Timestamp)),
        deliveryFee: deliveryFeeValue,
        total,
        originalCommand: rawInputToProcess,
        reportado: false,
        ...(customerName && { customerName }),
        predefinedItems: processedItems.map(i => ({ name: i.name, price: i.unitPrice })), // Mapping back to app type
      };

      if (currentItem) {
        const itemRef = doc(liveItemsCollectionRef, currentItem.id);
        await setDoc(itemRef, { ...finalItem });
      } else {
        await addDoc(liveItemsCollectionRef, { ...finalItem });
      }

      toast({
        duration: 4000,
        component: <ToastContent item={{ ...finalItem }} title={currentItem ? "Lançamento Atualizado" : "Lançamento Adicionado"} />,
      });

    } catch (error: any) {
      console.error('Error upserting item:', error);
      toast({
          variant: 'destructive',
          title: 'Erro ao processar item',
          description: 'Ocorreu um problema ao processar o lançamento.',
      });
    } finally {
      setIsProcessing(false);
      setRawInput('');
      setItemToEdit(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }


  const handleBomboniereAdd = (itemsToAdd: SelectedBomboniereItem[]) => {
    if (!bomboniereItems) return;
    const itemsString = itemsToAdd
      .map((item) => {
        const qtyPart = item.quantity;
        const namePart = bomboniereItems.find((bi) => bi.id === item.id)?.name || item.name;
        return `${qtyPart} ${namePart} ${String(item.price).replace('.', ',')}`;
      })
      .join(' ');

    setBomboniereModalOpen(false);

    if (rawInput.trim() === '') {
      handleUpsertItem(itemsString);
    } else {
      setRawInput((prev) => `${prev} ${itemsString}`.trim());
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleItemFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = rawInput.trim();
    if (!input) return;
    handleUpsertItem(input, itemToEdit);
  };

  const handleDeleteRequest = async (id: string) => {
    setItemToDelete(id);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete || !firestore || !allItems) return;

    const liveItemsCollectionRef = collection(firestore, 'live_items');
    const itemBeingDeleted = allItems.find((it) => it.id === itemToDelete);

    try {
      if (itemBeingDeleted && itemBeingDeleted.bomboniereItems && bomboniereItems) {
        const bomboniereCollectionRef = collection(firestore, 'bomboniere_items');
        const batch = writeBatch(firestore);
        for (const oldSoldItem of itemBeingDeleted.bomboniereItems) {
          const itemDef = bomboniereItems.find((i) => i.id === oldSoldItem.id);
          if (itemDef) {
            const newStock = itemDef.estoque + oldSoldItem.quantity;
            const docRef = doc(bomboniereCollectionRef, itemDef.id);
            batch.update(docRef, { estoque: newStock });
          }
        }
        await batch.commit();
      }

      const docRef = doc(liveItemsCollectionRef, itemToDelete);
      await deleteDoc(docRef);

      toast({ title: 'Item removido com sucesso.', variant: 'destructive' });
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast({ variant: 'destructive', title: 'Erro ao remover', description: 'Não foi possível remover o item.' });
    } finally {
      setItemToDelete(null);
    }
  };

  const handleEditRequest = (item: Item) => {
    setItemToEdit(item);
    setRawInput(item.originalCommand || '');
    inputRef.current?.focus();
  };

  const handleFavoriteSelect = (favorite: SavedFavorite) => {
    handleUpsertItem(favorite.command, null, favorite.name);
  };

  const handleFavoriteSave = (item: Item) => {
    if (!item.originalCommand) return;
    const name = prompt('Insira um nome para este favorito:', item.customerName || '');
    if (name) {
      const newFavorite: SavedFavorite = {
        id: String(Date.now()),
        name,
        command: item.originalCommand,
      };
      setSavedFavorites((prev) => [...prev, newFavorite]);
      toast({ title: 'Favorito guardado!', description: `O pedido de "${name}" foi guardado.` });
    }
  };

  const handleFavoriteDelete = (id: string) => {
    setSavedFavorites((prev) => prev.filter((f) => f.id !== id));
    toast({ title: 'Favorito removido.', variant: 'destructive' });
  };

  async function handleSaveReport() {
    if (!firestore || !items || items.length === 0 || !user?.uid) {
      toast({ variant: 'destructive', title: 'Impossível Salvar', description: 'Não há itens para gerar o relatório.' });
      return;
    }
    setIsSavingReport(true);

    try {
      const batch = writeBatch(firestore);
      const reportDate = new Date();
      const reportDateString = formatDateFn(reportDate, 'yyyy-MM-dd');


      const report: Omit<DailyReport, 'id'> = {
        reportDate: reportDateString,
        createdAt: new Date().toISOString(),
        totalGeral: totals.totalGeral,
        totalAVista: totals.totalAVista,
        totalFiado: totals.totalFiado,
        totalVendasSalao: totals.totalVendasSalao,
        totalVendasRua: totals.totalVendasRua,
        totalFiadoSalao: totals.totalFiadoSalao,
        totalFiadoRua: totals.totalFiadoRua,
        totalKg: totals.totalKg,
        totalTaxas: totals.totalTaxas,
        totalBomboniereSalao: totals.totalBomboniereSalao,
        totalBomboniereRua: totals.totalBomboniereRua,
        totalItens: totals.totalItens,
        totalPedidos: items.length,
        totalEntregas: totals.totalEntregas,
        totalItensRua: totals.totalItensRua,
        contagemTotal: totals.contagemTotal,
        contagemRua: totals.contagemRua,
        userId: user.uid,
      };
      
      const reportsCollection = collection(firestore, 'daily_reports');
      const reportRef = doc(reportsCollection);
      batch.set(reportRef, report);
      
      const liveItemsCollectionRef = collection(firestore, 'live_items');
      const archiveItemsCollectionRef = collection(firestore, 'order_items');
      items.forEach((item) => {
        const liveItemRef = doc(liveItemsCollectionRef, item.id);
        const archiveItemRef = doc(archiveItemsCollectionRef, item.id);
        batch.set(archiveItemRef, { ...item, reportado: true, reportDate: reportDateString });
        batch.delete(liveItemRef);
      });

      await batch.commit();

      toast({
        title: 'Relatório Salvo!',
        description: `O relatório do dia ${formatDateFn(reportDate, 'dd/MM/yyyy', { locale: ptBR })} foi salvo e os itens arquivados.`,
      });
    } catch (error: any) {
      console.error('Error saving report:', error);
      toast({
          variant: 'destructive',
          title: 'Erro ao Salvar',
          description: 'Não foi possível salvar o relatório ou arquivar os itens.',
        });
    } finally {
      setIsSavingReport(false);
    }
  };


  const totals = useMemo(() => {
    if (!items || items.length === 0) {
      return {
        totalGeral: 0,
        totalAVista: 0,
        totalFiado: 0,
        totalVendasSalao: 0,
        totalVendasRua: 0,
        totalFiadoSalao: 0,
        totalFiadoRua: 0,
        totalKg: 0,
        totalTaxas: 0,
        totalBomboniereSalao: 0,
        totalBomboniereRua: 0,
        totalItens: 0,
        totalPedidos: 0,
        totalEntregas: 0,
        totalItensRua: 0,
        contagemTotal: {} as ItemCount,
        contagemRua: {} as ItemCount,
      };
    }

    const result = items.reduce(
      (acc, item) => {
        acc.totalGeral += item.total;
        acc.totalItens += item.quantity;
        acc.totalTaxas += item.deliveryFee;

        const itemIsRua = item.group === 'Vendas rua' || item.group === 'Fiados rua';
        if (itemIsRua) {
          if (item.deliveryFee > 0) {
            acc.totalEntregas++;
          }
          acc.totalItensRua += item.quantity;
        }

        if (item.group === 'Fiados salão' || item.group === 'Fiados rua') {
          acc.totalFiado += item.total;
        } else {
          acc.totalAVista += item.total;
        }

        switch (item.group) {
          case 'Vendas salão':
            acc.totalVendasSalao += item.total;
            break;
          case 'Vendas rua':
            acc.totalVendasRua += item.total;
            break;
          case 'Fiados salão':
            acc.totalFiadoSalao += item.total;
            break;
          case 'Fiados rua':
            acc.totalFiadoRua += item.total;
            break;
        }

        const itemsToCount = [
          ...(item.predefinedItems?.map((i) => ({ ...i, count: 1 })) || []),
          ...(item.bomboniereItems?.map((i) => ({ name: i.name, count: i.quantity })) || []),
          ...(item.individualPrices?.map(() => ({ name: 'KG', count: 1 })) || []),
        ];

        itemsToCount.forEach(({ name, count }) => {
          acc.contagemTotal[name] = (acc.contagemTotal[name] || 0) + count;
          if (itemIsRua) {
            acc.contagemRua[name] = (acc.contagemRua[name] || 0) + count;
          }
        });

        const bomboniereTotal = item.bomboniereItems?.reduce((sum, bi) => sum + bi.price * bi.quantity, 0) || 0;
        if (itemIsRua) {
          acc.totalBomboniereRua += bomboniereTotal;
        } else {
          acc.totalBomboniereSalao += bomboniereTotal;
        }

        return acc;
      },
      {
        totalGeral: 0,
        totalAVista: 0,
        totalFiado: 0,
        totalVendasSalao: 0,
        totalVendasRua: 0,
        totalFiadoSalao: 0,
        totalFiadoRua: 0,
        totalKg: 0,
        totalTaxas: 0,
        totalBomboniereSalao: 0,
        totalBomboniereRua: 0,
        totalItens: 0,
        totalPedidos: 0,
        totalEntregas: 0,
        totalItensRua: 0,
        contagemTotal: {} as ItemCount,
        contagemRua: {} as ItemCount,
      }
    );

    result.totalPedidos = items.length;
    return result;
  }, [items]);

  const hasUnsavedChanges = items && items.length > 0;
  
  return (
    <>
      <BomboniereModal
        isOpen={isBomboniereModalOpen}
        onClose={() => setBomboniereModalOpen(false)}
        onAddItems={handleBomboniereAdd}
        bomboniereItems={bomboniereItems || []}
      />

      <StockEditModal
        isOpen={isStockEditModalOpen}
        onClose={() => setIsStockEditModalOpen(false)}
        bomboniereItems={bomboniereItems || []}
      />

      {passwordPrompt && (
        <PasswordDialog
          open={passwordPrompt.open}
          onOpenChange={(isOpen) => {
            if (!isOpen && passwordPrompt.onCancel) {
              passwordPrompt.onCancel();
            }
          }}
          onSuccess={handlePasswordSuccess}
          onCancel={passwordPrompt.onCancel}
          showCancel={!!passwordPrompt.onCancel}
        />
      )}

      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O item será excluído permanentemente da base de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mx-auto w-full px-2 sm:px-6 lg:px-12 pb-36">
        <header className="relative mb-6 flex h-24 flex-col items-center justify-center border-b border-border/40 pb-4">
          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-extrabold text-red-600 tracking-tighter text-center sm:text-5xl uppercase italic">
              MIRINHA EXPRESS
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.3em] font-medium opacity-70">Logística de Pedidos v2.0</p>
          </div>
          <div className="mt-4 flex items-center gap-2 w-full justify-center sm:absolute sm:right-0 sm:mt-0 sm:w-auto">
             <DatePicker date={selectedDate} setDate={setSelectedDate} />
             <Separator orientation="vertical" className="h-8 hidden sm:block" />
            <Button variant="outline" size="sm" onClick={() => router.push('/reports')}>
              <History className="mr-2 h-4 w-4" />
              Histórico
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/admin')}>
              Admin
            </Button>
          </div>
        </header>

        <main className="flex flex-col gap-8 w-full">
          <section className="w-full">
            <ItemForm
                rawInput={rawInput}
                setRawInput={setRawInput}
                onItemSubmit={handleItemFormSubmit}
                onOpenBomboniere={() => setBomboniereModalOpen(true)}
                isProcessing={isProcessing}
                inputRef={inputRef}
            >
                <FavoritesMenu savedFavorites={savedFavorites} onSelect={handleFavoriteSelect} onDelete={handleFavoriteDelete} />
            </ItemForm>
          </section>

          <section className="w-full space-y-4">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-bold tracking-tight">PEDIDOS ATIVOS</h2>
                <Badge variant="outline" className="text-xs font-mono">{items.length} ITENS</Badge>
            </div>
            <Card className="border-none shadow-xl bg-card/50 backdrop-blur-md">
                <CardContent className="p-0 sm:p-2">
                    <ItemList
                        items={items || []}
                        onEdit={handleEditRequest}
                        onDelete={handleDeleteRequest}
                        onFavorite={handleFavoriteSave}
                        savedFavorites={savedFavorites}
                        isLoading={isLoadingItems || isUserLoading}
                    />
                </CardContent>
            </Card>
          </section>
        </main>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto grid max-w-4xl grid-cols-2 items-center gap-2 p-1 text-center text-sm">
          <div className="grid grid-cols-2 items-center text-[0.6rem]">
            <div className="flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">À Vista:</span>
                <span className="font-bold text-green-500">{formatCurrency(totals.totalAVista)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Fiado:</span>
                <span className="font-bold text-destructive">{formatCurrency(totals.totalFiado)}</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center border-l border-border/50 h-full">
              <span className="text-muted-foreground">Entregas</span>
              <span className="font-bold text-foreground">
                {totals.totalEntregas} ({formatCurrency(totals.totalTaxas)})
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col items-center justify-center rounded-lg bg-blue-500/10 p-1 flex-grow">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-500/80">Total</span>
              <span className="text-base font-bold text-blue-500">{formatCurrency(totals.totalGeral)}</span>
            </div>
            <Button
              onClick={handleSaveReport}
              disabled={!hasUnsavedChanges || isSavingReport}
              size="sm"
              className="h-full"
            >
              {isSavingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </footer>
    </>
  );
}


export default function Home() {
  const { isUserLoading } = useUser();

  if (isUserLoading) {
      return (
          <div className="flex h-screen w-full flex-col items-center justify-center text-center p-4">
              <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary mb-4" />
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 text-muted-foreground">A ligar à base de dados...</p>
          </div>
      )
  }

  return <LancheTrackerPageContent />;
}
