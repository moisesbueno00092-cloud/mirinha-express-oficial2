
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
  where,
  getDocs,
} from 'firebase/firestore';

import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Save,
  Loader2,
  History,
  Wrench,
  Star,
  Settings,
  Trash2,
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

  const [predefinedPrices, setPredefinedPrices] = usePersistentState('predefinedPrices', PREDEFINED_PRICES);
  const [deliveryFee, setDeliveryFee] = usePersistentState('deliveryFee', DELIVERY_FEE);

  const liveItemsQuery = useMemo(() => {
    if (!firestore) return null;
    // Consulta simples sem orderBy para evitar erros de índice
    const q = query(collection(firestore, 'live_items'));
    return q;
  }, [firestore]);
  
  const { data: allItems, isLoading: isLoadingItems, error: itemsError } = useCollection<Item>(liveItemsQuery);

  const items = useMemo(() => {
    if (!allItems) return [];
    // Ordenação manual em memória para evitar a necessidade de criar índices compostos no Firestore
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
  const { data: bomboniereItemsFromDB, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(
    bomboniereItemsQuery
  );

  const bomboniereItems = useMemo(() => {
    if (!isLoadingBomboniere && bomboniereItemsFromDB && bomboniereItemsFromDB.length > 0) {
      return bomboniereItemsFromDB;
    }
    return [];
  }, [bomboniereItemsFromDB, isLoadingBomboniere]);
  
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
  const prevIsProcessing = useRef<boolean>(undefined);


  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);

  const [savedFavorites, setSavedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);

  const [passwordPrompt, setPasswordPrompt] = useState<{ open: boolean; onSuccess: () => void; onCancel?: () => void; } | null>(null);

  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isDeleteSelectedAlertOpen, setIsDeleteSelectedAlertOpen] = useState(false);

  useEffect(() => {
    if (prevIsProcessing.current === true && !isProcessing) {
      inputRef.current?.focus();
    }
    prevIsProcessing.current = isProcessing;
  }, [isProcessing]);


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

  const handleProtectedAction = (callback: () => void) => {
    try {
      const sessionAuth = sessionStorage.getItem('admin-authenticated');
      if (sessionAuth === 'true') {
        callback();
        return;
      }
    } catch (e) {
      console.error('Could not read sessionStorage:', e);
    }

    setPasswordPrompt({
      open: true,
      onSuccess: callback,
      onCancel: () => setPasswordPrompt(null),
    });
  };

  async function handleUpsertItem(rawInputToProcess: string, currentItem?: Item | null, favoriteName?: string) {
    setIsProcessing(true);
    if (!firestore || !user?.uid) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Base de dados indisponível.' });
      setIsProcessing(false);
      return;
    }
    const liveItemsCollectionRef = collection(firestore, 'live_items');


    try {
      if (currentItem && currentItem.bomboniereItems && currentItem.bomboniereItems.length > 0 && bomboniereItems) {
        const bomboniereCollectionRef = collection(firestore, 'bomboniere_items');
        const batch = writeBatch(firestore);
        for (const oldSoldItem of currentItem.bomboniereItems) {
          const itemDef = bomboniereItems.find((i) => i.id === oldSoldItem.id);
          if (itemDef) {
            const newStock = itemDef.estoque + oldSoldItem.quantity;
            const docRef = doc(bomboniereCollectionRef, itemDef.id);
            batch.update(docRef, { estoque: newStock });
          }
        }
        await batch.commit();
      }

      let mainInput = rawInputToProcess.trim();
      if (!mainInput) return;

      let group: Group = 'Vendas salão';

      let deliveryFeeApplicable = false;
      let isTaxExempt = false;
      let originalGroup: Group | null = null;
      let customerName: string | undefined = favoriteName;

      const partsWithExemption = mainInput.split(' ').filter((part) => part.trim() !== '');
      if (partsWithExemption.map((p) => p.toUpperCase()).includes('E')) {
        isTaxExempt = true;
        mainInput = partsWithExemption.filter((p) => p.toUpperCase() !== 'E').join(' ');
      }

      const upperCaseProcessedInput = mainInput.toUpperCase();

      if (upperCaseProcessedInput.startsWith('R ')) {
        group = 'Vendas rua';
        originalGroup = group;
        deliveryFeeApplicable = true;
        mainInput = mainInput.substring(2).trim();
      } else if (upperCaseProcessedInput.startsWith('FR ')) {
        group = 'Fiados rua';
        originalGroup = group;
        deliveryFeeApplicable = true;
        mainInput = mainInput.substring(3).trim();
      } else if (upperCaseProcessedInput.startsWith('F ')) {
        group = 'Fiados salão';
        originalGroup = group;
        mainInput = mainInput.substring(2).trim();
      }

      let parts = mainInput.split(' ').filter((part) => part.trim() !== '');
      let consumedParts = new Array(parts.length).fill(false);
      
      let totalQuantity = 0;
      let totalPrice = 0;
      let individualPrices: number[] = [];
      let predefinedItems: PredefinedItem[] = [];
      let processedBomboniereItems: SelectedBomboniereItem[] = [];
      let customDeliveryFee: number | null = null;
      let addFeeToTotal = true;
      

      // --- Pass 1: Bomboniere Items ---
      for (let i = 0; i < parts.length; i++) {
        if (consumedParts[i]) continue;

        let bestMatch = null;
        let bestMatchEndIndex = -1;
        
        for (let j = parts.length; j > i; j--) {
            const potentialName = parts.slice(i, j).join(' ').toLowerCase();
            if (bomboniereItemsByName[potentialName]) {
                bestMatch = bomboniereItemsByName[potentialName];
                bestMatchEndIndex = j;
                break;
            }
        }

        if (bestMatch) {
            let bomboniereQty = 1;
            if (i > 0 && !consumedParts[i - 1] && isNumeric(parts[i - 1])) {
                bomboniereQty = parseInt(parts[i - 1], 10);
                consumedParts[i - 1] = true;
            }

            let priceToUse = bestMatch.price;
            if (bestMatchEndIndex < parts.length && !consumedParts[bestMatchEndIndex] && isNumeric(parts[bestMatchEndIndex])) {
                priceToUse = parseFloat(bestMatchEndIndex < parts.length ? parts[bestMatchEndIndex].replace(',', '.') : '0');
                consumedParts[bestMatchEndIndex] = true;
            }
            
            processedBomboniereItems.push({ id: bestMatch.id, name: bestMatch.name, quantity: bomboniereQty, price: priceToUse });
            totalPrice += priceToUse * bomboniereQty;
            totalQuantity += bomboniereQty;

            for (let k = i; k < bestMatchEndIndex; k++) {
                consumedParts[k] = true;
            }
            i = bestMatchEndIndex - 1;
        }
      }

      // --- Pass 2: KG, TX, Predefined Items ---
      for (let i = 0; i < parts.length; i++) {
        if (consumedParts[i]) continue;
      
        const part = parts[i];
      
        if (part.toUpperCase() === 'KG') {
            consumedParts[i] = true;
            let nextIndex = i + 1;
            while(nextIndex < parts.length && !consumedParts[nextIndex] && isNumeric(parts[nextIndex])) {
                const price = parseFloat(parts[nextIndex].replace(',', '.'));
                individualPrices.push(price);
                totalPrice += price;
                totalQuantity++;
                consumedParts[nextIndex] = true;
                nextIndex++;
            }
            i = nextIndex - 1;
            continue;
        }
        
        if (part.toUpperCase() === 'TX') {
          if (i + 1 < parts.length && !consumedParts[i+1]) {
            let feePart = parts[i + 1];
            if (feePart.toLowerCase().startsWith('d')) {
                addFeeToTotal = false;
                feePart = feePart.substring(1);
            }

            if (isNumeric(feePart)) {
                customDeliveryFee = parseFloat(feePart.replace(',', '.'));
                consumedParts[i] = true;
                consumedParts[i+1] = true;
                i++;
            }
          }
          continue;
        }
      
        let qty = 1;
        let itemNamePart = part;
        const qtyMatch = part.match(/^(\d+)([a-zA-Z\s]+)/);

        if (qtyMatch) {
            qty = parseInt(qtyMatch[1], 10);
            itemNamePart = qtyMatch[2];
        }

        const isPredefined = predefinedPrices[itemNamePart.toUpperCase()];
        if (isPredefined) {
            consumedParts[i] = true;
            let priceToUse = isPredefined;
            
            if (i + 1 < parts.length && !consumedParts[i + 1] && isNumeric(parts[i + 1])) {
                priceToUse = parseFloat(parts[i + 1].replace(',', '.'));
                consumedParts[i + 1] = true;
                i++;
            }

            for (let j = 0; j < qty; j++) {
                predefinedItems.push({ name: itemNamePart.toUpperCase(), price: priceToUse });
                totalPrice += priceToUse;
            }
            totalQuantity += qty;
            continue;
        }
      }


      const potentialCustomerNameParts = parts.filter((_, index) => !consumedParts[index]);
      if (!customerName && potentialCustomerNameParts.length > 0) {
        customerName = potentialCustomerNameParts.join(' ');
      }

      if (predefinedItems.length === 0 && individualPrices.length === 0 && processedBomboniereItems.length === 0) {
        toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Nenhum item válido foi encontrado.' });
        setIsProcessing(false);
        return;
      }

      if (
        originalGroup === null &&
        predefinedItems.length === 0 &&
        individualPrices.length === 0 &&
        processedBomboniereItems.length > 0
      ) {
        group = 'Vendas salão';
        deliveryFeeApplicable = false;
      }

      if (bomboniereItems) {
        const bomboniereCollectionRef = collection(firestore, 'bomboniere_items');
        const batch = writeBatch(firestore);
        for (const soldItem of processedBomboniereItems) {
          const itemDef = bomboniereItems.find((i) => i.id === soldItem.id);
          if (itemDef) {
            const newStock = itemDef.estoque - soldItem.quantity;
            const docRef = doc(bomboniereCollectionRef, itemDef.id);
            batch.update(docRef, { estoque: newStock });
          }
        }
        await batch.commit();
      }

      const finalDeliveryFee = isTaxExempt ? 0 : customDeliveryFee !== null ? customDeliveryFee : deliveryFeeApplicable ? deliveryFee : 0;
      const total = addFeeToTotal ? (totalPrice + finalDeliveryFee) : totalPrice;

      let consolidatedName: string;
      const hasKgItems = individualPrices.length > 0;
      const hasPredefinedItems = predefinedItems.length > 0;
      const hasBomboniereItems = processedBomboniereItems.length > 0;

      const nameParts = [];
      if (hasPredefinedItems) nameParts.push(predefinedItems.map((p) => p.name).join(' '));
      if (hasKgItems) nameParts.push('KG');
      if (hasBomboniereItems)
        nameParts.push(processedBomboniereItems.map((item) => `${item.quantity > 1 ? item.quantity : ''}${item.name}`).join(' '));

      consolidatedName = nameParts.join(' + ') || 'Lançamento';
      if (consolidatedName.length > 50) consolidatedName = 'Lançamento Misto';

      const finalItem: Omit<Item, 'id'> = {
        userId: user.uid,
        name: consolidatedName,
        quantity: totalQuantity,
        price: totalPrice,
        group,
        // PRESERVAÇÃO DE HORÁRIO: Mantém o timestamp original se estiver a editar
        timestamp: currentItem ? currentItem.timestamp : (serverTimestamp() as Timestamp),
        deliveryFee: finalDeliveryFee,
        total,
        originalCommand: rawInputToProcess,
        reportado: false,
        ...(customerName && { customerName }),
        ...(individualPrices.length > 0 ? { individualPrices } : {}),
        ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
        ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
      };

      if (currentItem) {
        const itemRef = doc(liveItemsCollectionRef, currentItem.id);
        await setDoc(itemRef, { ...finalItem });
        toast({
          duration: 4000,
          component: <ToastContent item={{ ...finalItem, total: finalItem.total }} title="Lançamento Atualizado" />,
        });
      } else {
        await addDoc(liveItemsCollectionRef, { ...finalItem });
        toast({
          duration: 4000,
          component: <ToastContent item={{ ...finalItem, total: finalItem.total }} title="Lançamento Adicionado" />,
        });
      }
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

  const handleItemFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawInput.trim()) return;
    await handleUpsertItem(rawInput, itemToEdit);
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

  const handleToggleSelectionMode = () => {
    setIsSelectionModeActive(prev => !prev);
    setSelectedItems([]);
  };
  
  const handleItemSelect = (itemId: string, isSelected: boolean) => {
    setSelectedItems(prev => {
      if (isSelected) {
        return [...prev, itemId];
      } else {
        return prev.filter(id => id !== itemId);
      }
    });
  };

  const handleSelectAll = (isChecked: boolean) => {
    if (isChecked) {
      setSelectedItems(items.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };
  
  const handleDeleteSelected = async () => {
    if (!firestore || selectedItems.length === 0 || !items) {
      setIsDeleteSelectedAlertOpen(false);
      return;
    }
  
    const liveItemsCollectionRef = collection(firestore, 'live_items');
    const bomboniereCollectionRef = collection(firestore, 'bomboniere_items');
    const deleteBatch = writeBatch(firestore);
  
    try {
      for (const itemId of selectedItems) {
        const itemBeingDeleted = items.find((it) => it.id === itemId);
  
        if (itemBeingDeleted && itemBeingDeleted.bomboniereItems && bomboniereItems) {
          for (const soldItem of itemBeingDeleted.bomboniereItems) {
            const itemDef = bomboniereItems.find((i) => i.id === soldItem.id);
            if (itemDef) {
              const newStock = itemDef.estoque + soldItem.quantity;
              const docRef = doc(bomboniereCollectionRef, itemDef.id);
              deleteBatch.update(docRef, { estoque: newStock });
            }
          }
        }
  
        const docRef = doc(liveItemsCollectionRef, itemId);
        deleteBatch.delete(docRef);
      }
  
      await deleteBatch.commit();
  
      toast({
        title: 'Itens Removidos',
        description: `${selectedItems.length} lançamento(s) foram excluídos com sucesso.`,
      });
  
    } catch (error: any) {
      console.error('Error deleting selected items:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Remover',
        description: 'Não foi possível remover os itens selecionados.',
      });
    } finally {
      setSelectedItems([]);
      setIsSelectionModeActive(false);
      setIsDeleteSelectedAlertOpen(false);
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

      <AlertDialog open={isDeleteSelectedAlertOpen} onOpenChange={setIsDeleteSelectedAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedItems.length} Lançamentos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os itens serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>Confirmar Exclusão</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-36">
        <header className="relative mb-6 flex h-20 items-center justify-center">
          <div className="absolute left-0 flex items-center gap-2">
          </div>
          <div className="flex flex-col items-center">
            <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary" />
            <p className="text-muted-foreground -mt-2 text-sm sm:text-base">Controle de Pedidos</p>
          </div>
          <div className="absolute right-0 flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/reports')}>
              <History className="mr-2 h-4 w-4" />
              Relatórios
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin')}>
              <Wrench className="mr-2 h-4 w-4" />
              Admin
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground" onClick={handleToggleSelectionMode}>
                <Settings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="space-y-6">
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
          
          {isSelectionModeActive && (
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                    <div className="text-sm font-medium">
                        Modo de Seleção Ativo: {selectedItems.length} item(s) selecionado(s).
                    </div>
                    <div className="flex items-center gap-2">
                         <Button variant="outline" onClick={handleToggleSelectionMode}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => setIsDeleteSelectedAlertOpen(true)}
                            disabled={selectedItems.length === 0}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir Selecionados
                        </Button>
                    </div>
                </CardContent>
              </Card>
          )}

          <div className="space-y-4 pt-6">
            <Separator />
            <h2 className="text-xl font-semibold leading-none tracking-tight">Lançamentos do Dia</h2>
            <ItemList
              items={items || []}
              onEdit={handleEditRequest}
              onDelete={handleDeleteRequest}
              onFavorite={handleFavoriteSave}
              savedFavorites={savedFavorites}
              isLoading={isLoadingItems || isUserLoading}
              isSelectionMode={isSelectionModeActive}
              selectedItems={selectedItems}
              onItemSelect={handleItemSelect}
              onSelectAll={handleSelectAll}
            />
          </div>
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
