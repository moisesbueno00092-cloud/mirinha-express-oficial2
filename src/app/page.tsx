
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
import { PREDEFINED_PRICES, DELIVERY_FEE, BOMBONIERE_ITEMS_DEFAULT } from '@/lib/constants';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
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
import { parseCustomItemPrice } from '@/ai/flows/parse-custom-item-price';

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
} from 'lucide-react';

import ItemForm from '@/components/item-form';
import BomboniereModal from '@/components/bomboniere-modal';
import StockEditModal from '@/components/stock-edit-modal';
import MirinhaLogo from '@/components/mirinha-logo';
import FavoritesMenu from '@/components/favorites-menu';
import { format as formatDateFn } from 'date-fns';
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

function LancheTrackerPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const liveItemsCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'live_items') : null),
    [firestore]
  );
  
  const liveItemsQuery = useMemoFirebase(
    () => (liveItemsCollectionRef ? query(liveItemsCollectionRef, orderBy('timestamp', 'desc')) : null),
    [liveItemsCollectionRef]
  );
  
  const { data: allItems, isLoading: isLoadingItems, error: itemsError } = useCollection<Item>(liveItemsQuery);

  const items = useMemo(() => {
    if (!allItems) return [];
    return allItems.filter(item => !item.reportado);
  }, [allItems]);


  useEffect(() => {
    if (itemsError) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar itens',
        description: `Não foi possível carregar os lançamentos. Verifique a sua conexão ou as permissões da base de dados. Detalhe: ${itemsError.message}`,
        duration: 8000,
      });
      console.error("Firestore Error:", itemsError);
    }
  }, [itemsError, toast]);


  const bomboniereItemsRef = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null),
    [firestore]
  );
  const { data: bomboniereItemsFromDB, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(
    bomboniereItemsRef
  );

  const bomboniereItems = useMemo(() => {
    if (!isLoadingBomboniere && bomboniereItemsFromDB && bomboniereItemsFromDB.length > 0) {
      return bomboniereItemsFromDB;
    }
    return BOMBONIERE_ITEMS_DEFAULT;
  }, [bomboniereItemsFromDB, isLoadingBomboniere]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isBomboniereModalOpen, setBomboniereModalOpen] = useState(false);
  const [isStockEditModalOpen, setIsStockEditModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);

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
    if (!firestore || !liveItemsCollectionRef) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Base de dados indisponível. A página será recarregada.' });
      setIsProcessing(false);
      setTimeout(() => window.location.reload(), 2000);
      return;
    }

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

      const parts = mainInput.split(' ').filter((part) => part.trim() !== '');

      let totalQuantity = 0;
      let totalPrice = 0;
      let individualPrices: number[] = [];
      let predefinedItems: PredefinedItem[] = [];
      let processedBomboniereItems: SelectedBomboniereItem[] = [];
      let customDeliveryFee: number | null = null;

      let potentialCustomerNameParts: string[] = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const upperPart = part.toUpperCase();

        if (upperPart === 'KG') {
          i++;
          while (i < parts.length && isNumeric(parts[i])) {
            const price = parseFloat(parts[i].replace(',', '.'));
            individualPrices.push(price);
            totalPrice += price;
            i++;
          }
          i--;
          totalQuantity += individualPrices.length;
          continue;
        }

        if (upperPart === 'TX') {
          if (i + 1 < parts.length && isNumeric(parts[i + 1])) {
            customDeliveryFee = parseFloat(parts[i + 1].replace(',', '.'));
            i++;
          }
          continue;
        }

        const quantityMatch = part.match(/^(\d+)([\w\d-]+)$/i);
        let baseQuantity = 1;
        let currentItemCode = upperPart;
        let currentItemNameOnly = upperPart;

        if (quantityMatch) {
          baseQuantity = parseInt(quantityMatch[1], 10);
          currentItemCode = quantityMatch[2].toUpperCase();
          currentItemNameOnly = quantityMatch[2];
        } else {
          currentItemNameOnly = part;
        }

        const isPredefined = PREDEFINED_PRICES[currentItemCode];
        const bomboniereItemDef = bomboniereItems?.find(
          (bi) => bi.name.toLowerCase().replace(/\s+/g, '-') === currentItemNameOnly.toLowerCase()
        );

        if (isPredefined) {
          const defaultPrice = PREDEFINED_PRICES[currentItemCode];
          let priceToUse = defaultPrice;

          if (i + 1 < parts.length && isNumeric(parts[i + 1])) {
            priceToUse = parseFloat(parts[i + 1].replace(',', '.'));
            i++;
          }

          for (let j = 0; j < baseQuantity; j++) {
            predefinedItems.push({ name: currentItemCode, price: priceToUse });
            totalPrice += priceToUse;
          }
          totalQuantity += baseQuantity;
        } else if (bomboniereItemDef) {
          let priceToUse = bomboniereItemDef.price;
          if (i + 1 < parts.length && isNumeric(parts[i + 1])) {
            priceToUse = parseFloat(parts[i + 1].replace(',', '.'));
            i++;
          }
          processedBomboniereItems.push({
            id: bomboniereItemDef.id,
            name: bomboniereItemDef.name,
            quantity: baseQuantity,
            price: priceToUse,
          });
          totalPrice += priceToUse * baseQuantity;
          totalQuantity += baseQuantity;
        } else if (!isNumeric(part) && /^\d*[a-zA-Z-]+$/.test(part) && i + 1 < parts.length && isNumeric(parts[i + 1])) {
          const bomboniereMatch = part.match(/^(\d*)([a-zA-Z\d\s-]+)$/i);
          const qty = bomboniereMatch && bomboniereMatch[1] ? parseInt(bomboniereMatch[1], 10) : 1;
          const namePart = bomboniereMatch ? bomboniereMatch[2] : part;
          const existingItemDef = bomboniereItems?.find(
            (bi) => bi.name.toUpperCase().replace(/\s+/g, '-') === namePart.toUpperCase()
          );

          processedBomboniereItems.push({
            id: existingItemDef?.id || namePart,
            name: existingItemDef?.name || namePart,
            quantity: qty,
            price: parseFloat(parts[i + 1].replace(',', '.')),
          });
          totalPrice += parseFloat(parts[i + 1].replace(',', '.')) * qty;
          totalQuantity += qty;
          i++;
        } else if (part.match(/^\d+[a-zA-Z]+/) && i + 1 < parts.length && isNumeric(parts[i + 1])) {
          try {
            const { itemName, customPrice } = await parseCustomItemPrice({ itemName: `${part} ${parts[i + 1]}`.trim() });
            if (customPrice !== undefined) {
              const bomboniereMatch = itemName.match(/^(\d*)([A-Z\d\s-]+)$/i);
              const qty = bomboniereMatch && bomboniereMatch[1] ? parseInt(bomboniereMatch[1], 10) : 1;
              const name = bomboniereMatch ? bomboniereMatch[2] : itemName;
              const existingItemDef = bomboniereItems?.find(
                (bi) => bi.name.toUpperCase().replace(/\s+/g, '-') === name.toUpperCase()
              );

              processedBomboniereItems.push({
                id: existingItemDef?.id || name,
                name: existingItemDef?.name || name,
                quantity: qty,
                price: customPrice,
              });
              totalPrice += customPrice * qty;
              totalQuantity += qty;
              i++;
            }
          } catch (e) {
            console.error('AI parsing failed, skipping part:', part, e);
          }
        } else if (!isNumeric(part) && /^[a-zA-Z\s]+$/.test(part) && (group.startsWith('Fiado') || !customerName)) {
          potentialCustomerNameParts.push(part);
        }
      }

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

      const deliveryFee = isTaxExempt ? 0 : customDeliveryFee !== null ? customDeliveryFee : deliveryFeeApplicable ? DELIVERY_FEE : 0;
      const total = totalPrice + deliveryFee;

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
        name: consolidatedName,
        quantity: totalQuantity,
        price: totalPrice,
        group,
        timestamp: serverTimestamp() as Timestamp,
        deliveryFee,
        total,
        originalCommand: rawInputToProcess,
        reportado: false,
        ...(user && { userId: user.uid }),
        ...(customerName && { customerName }),
        ...(individualPrices.length > 0 ? { individualPrices } : {}),
        ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
        ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
      };

      if (currentItem) {
        const itemRef = doc(liveItemsCollectionRef, currentItem.id);
        await setDoc(itemRef, finalItem);
        toast({
          duration: 4000,
          component: <ToastContent item={{ ...finalItem, total: finalItem.total }} title="Lançamento Atualizado" />,
        });
      } else {
        await addDoc(liveItemsCollectionRef, finalItem);
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
          description: error.message || 'Ocorreu um problema ao processar o lançamento.',
      });
    } finally {
      setIsProcessing(false);
      setRawInput('');
      setItemToEdit(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }


  const handleBomboniereAdd = (itemsToAdd: SelectedBomboniereItem[]) => {
    if (!bomboniereItems) return;
    const itemsString = itemsToAdd
      .map((item) => {
        const qtyPart = item.quantity > 1 ? item.quantity : '';
        const namePart = bomboniereItems.find((bi) => bi.id === item.id)?.name.replace(/\s+/g, '-').toLowerCase() || item.name;
        return `${qtyPart}${namePart} ${String(item.price).replace('.', ',')}`;
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
    if (!itemToDelete || !firestore || !liveItemsCollectionRef || !items) return;

    const itemBeingDeleted = items.find((it) => it.id === itemToDelete);

    try {
      if (itemBeingDeleted && itemBeingDeleted.bomboniereItems && bomboniereItems) {
        const bomboniereCollectionRef = collection(firestore, 'bomboniere_items');
        const batch = writeBatch(firestore);
        for (const soldItem of itemBeingDeleted.bomboniereItems) {
          const itemDef = bomboniereItems.find((i) => i.id === soldItem.id);
          if (itemDef) {
            const newStock = itemDef.estoque + soldItem.quantity;
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
      toast({ variant: 'destructive', title: 'Erro ao remover', description: error.message || 'Não foi possível remover o item.' });
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
    if (!firestore || !user || !items || items.length === 0) {
      toast({ variant: 'destructive', title: 'Impossível Salvar', description: 'Não há itens para gerar o relatório.' });
      return;
    }
    setIsSavingReport(true);

    try {
      const batch = writeBatch(firestore);
      const reportDate = new Date();

      const report: DailyReport = {
        userId: user.uid,
        reportDate: reportDate.toISOString(),
        createdAt: reportDate.toISOString(),
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
      };

      const reportRef = doc(collection(firestore, 'daily_reports'));
      batch.set(reportRef, report);

      items.forEach((item) => {
        const liveItemRef = doc(liveItemsCollectionRef!, item.id);
        const archiveItemRef = doc(collection(firestore, 'order_items'), item.id);
        batch.set(archiveItemRef, { ...item, reportado: true });
        batch.delete(liveItemRef);
      });

      await batch.commit();

      toast({
        title: 'Relatório Salvo!',
        description: 'O relatório do dia foi salvo e os itens arquivados.',
      });
    } catch (error: any) {
      console.error('Error saving report:', error);
      toast({
          variant: 'destructive',
          title: 'Erro ao Salvar',
          description: error.message || 'Não foi possível salvar o relatório ou arquivar os itens.',
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
  
  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center text-center p-4">
        <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary mb-4" />
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">A autenticar...</p>
      </div>
    );
  }

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
              Esta ação não pode ser desfeita. O item será excluído permanentemente da base de dados. Se contiver itens de bomboniere, o estoque será devolvido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-36">
        <header className="relative mb-6 flex h-20 items-center justify-center">
          <div className="absolute left-0 flex items-center gap-2">
            {/* Placeholder to balance the right side, can be hidden or used for other controls */}
          </div>
          <div className="flex flex-col items-center">
            <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary" />
            <p className="text-muted-foreground -mt-2 text-sm sm:text-base">Controle de Pedidos</p>
          </div>
          <div className="absolute right-0 flex items-center gap-2">
            <Button variant="outline" onClick={() => handleProtectedAction(() => router.push('/reports'))}>
              <History className="mr-2 h-4 w-4" />
              Relatórios
            </Button>
            <Button variant="outline" onClick={() => handleProtectedAction(() => router.push('/admin'))}>
              <Wrench className="mr-2 h-4 w-4" />
              Admin
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
            <div className="flex flex-col items-center justify-center rounded-lg bg-primary/10 p-1 flex-grow">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary/80">Total</span>
              <span className="text-base font-bold text-primary">{formatCurrency(totals.totalGeral)}</span>
            </div>
            <Button
              onClick={handleSaveReport}
              disabled={isSavingReport || !hasUnsavedChanges}
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
  return (
      <LancheTrackerPage />
  );
}
