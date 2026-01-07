
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from 'next/navigation';
import type { Item, Group, PredefinedItem, SelectedBomboniereItem, BomboniereItem, DailyReport, ItemCount, SavedFavorite, User } from "@/types";
import { PREDEFINED_PRICES, DELIVERY_FEE, BOMBONIERE_ITEMS_DEFAULT } from "@/lib/constants";
import { useAuth, useCollection, useFirestore, useMemoFirebase, useUser, FirestorePermissionError, errorEmitter } from "@/firebase";
import { collection, doc, query, where, orderBy, deleteDoc, writeBatch, DocumentReference, addDoc, serverTimestamp, Timestamp, getDocs, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";
import usePersistentState from "@/hooks/use-persistent-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, History, Settings, Wrench, Users, Star, PiggyBank, Info, ArrowLeft } from "lucide-react";
import { addDocumentNonBlocking, commitBatch, deleteDocumentNonBlocking, setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import BomboniereModal from "@/components/bomboniere-modal";
import StockEditModal from "@/components/stock-edit-modal";
import MirinhaLogo from "@/components/mirinha-logo";
import FavoritesMenu from "@/components/favorites-menu";
import { format, isToday, parseISO, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import ItemList from "@/components/item-list";
import { Separator } from "@/components/ui/separator";
import PasswordDialog from "@/components/password-dialog";
import Link from "next/link";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
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
        {item.deliveryFee && item.deliveryFee > 0 && <div className="text-xs text-muted-foreground">Taxa: {formatCurrency(item.deliveryFee)}</div>}
      </div>
    </div>
  </div>
);


function LancheTrackerPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const [items, setItems] = usePersistentState<Item[]>('dailyItems', []);
  const isLoadingItems = false;


  const bomboniereItemsRef = useMemoFirebase(() => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null), [firestore]);
  const { data: bomboniereItemsFromDB, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsRef);
  
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
  const [rawInput, setRawInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);

  const [savedFavorites, setSavedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);

  const [passwordPrompt, setPasswordPrompt] = useState<{ open: boolean, onSuccess: () => void, onCancel?: () => void } | null>(null);
  
  const { toast } = useToast();

  const handlePasswordSuccess = () => {
    if (passwordPrompt?.onSuccess) {
        try {
            sessionStorage.setItem('admin-authenticated', 'true');
        } catch(e) {
            console.error("Could not write to sessionStorage:", e);
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
    } catch(e) {
        console.error("Could not read sessionStorage:", e);
    }
    
    setPasswordPrompt({ 
        open: true, 
        onSuccess: callback,
        onCancel: () => setPasswordPrompt(null)
    });
  };

  const handleUpsertItem = async (rawInputToProcess: string, currentItem?: Item | null, favoriteName?: string) => {
    setIsProcessing(true);
    if (!user || !firestore) {
        toast({ variant: "destructive", title: "Erro", description: "Utilizador não autenticado." });
        setIsProcessing(false);
        return;
    }
    
    try {
        // --- Devolver stock antigo se estiver a editar ---
        if (currentItem && currentItem.bomboniereItems && currentItem.bomboniereItems.length > 0 && bomboniereItems) {
            const bomboniereCollectionRef = collection(firestore, "bomboniere_items");
            for (const oldSoldItem of currentItem.bomboniereItems) {
                const itemDef = bomboniereItems.find(i => i.id === oldSoldItem.id);
                if (itemDef) {
                    const newStock = itemDef.estoque + oldSoldItem.quantity;
                    const docRef = doc(bomboniereCollectionRef, itemDef.id);
                    updateDocumentNonBlocking(docRef, { estoque: newStock });
                }
            }
        }
        // --- Fim da devolução de stock ---

        let mainInput = rawInputToProcess.trim();
        if (!mainInput) return;

        let group: Group = 'Vendas salão';
        
        let deliveryFeeApplicable = false;
        let isTaxExempt = false;
        let originalGroup: Group | null = null;
        let customerName: string | undefined = favoriteName;
        
        const partsWithExemption = mainInput.split(' ').filter(part => part.trim() !== '');
        if (partsWithExemption.map(p => p.toUpperCase()).includes('E')) {
          isTaxExempt = true;
          mainInput = partsWithExemption.filter(p => p.toUpperCase() !== 'E').join(' ');
        }

        const upperCaseProcessedInput = mainInput.toUpperCase();

        if (upperCaseProcessedInput.startsWith("R ")) {
            group = 'Vendas rua';
            originalGroup = group;
            deliveryFeeApplicable = true;
            mainInput = mainInput.substring(2).trim();
        } else if (upperCaseProcessedInput.startsWith("FR ")) {
            group = 'Fiados rua';
            originalGroup = group;
            deliveryFeeApplicable = true;
            mainInput = mainInput.substring(3).trim();
        } else if (upperCaseProcessedInput.startsWith("F ")) {
            group = 'Fiados salão';
            originalGroup = group;
            mainInput = mainInput.substring(2).trim();
        }
        
        const parts = mainInput.split(' ').filter(part => part.trim() !== '');
        
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
                while(i < parts.length && isNumeric(parts[i])) {
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
                if (i + 1 < parts.length && isNumeric(parts[i+1])) {
                    customDeliveryFee = parseFloat(parts[i+1].replace(',', '.'));
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
            const bomboniereItemDef = bomboniereItems?.find(bi => bi.name.toLowerCase().replace(/\s+/g, '-') === currentItemNameOnly.toLowerCase());
            
            if (isPredefined) {
                const defaultPrice = PREDEFINED_PRICES[currentItemCode];
                let priceToUse = defaultPrice;

                if (i + 1 < parts.length && isNumeric(parts[i + 1])) {
                    priceToUse = parseFloat(parts[i + 1].replace(',', '.'));
                    i++; 
                }
                
                for(let j=0; j < baseQuantity; j++) {
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
                processedBomboniereItems.push({ id: bomboniereItemDef.id, name: bomboniereItemDef.name, quantity: baseQuantity, price: priceToUse });
                totalPrice += priceToUse * baseQuantity;
                totalQuantity += baseQuantity;
            } else if (!isNumeric(part) && /^\d*[a-zA-Z-]+$/.test(part) && (i + 1 < parts.length) && isNumeric(parts[i+1])) {
                const bomboniereMatch = part.match(/^(\d*)([a-zA-Z\d\s-]+)$/i);
                const qty = bomboniereMatch && bomboniereMatch[1] ? parseInt(bomboniereMatch[1], 10) : 1;
                const namePart = bomboniereMatch ? bomboniereMatch[2] : part;
                const price = parseFloat(parts[i+1].replace(',', '.'));
                const existingItemDef = bomboniereItems?.find(bi => bi.name.toUpperCase().replace(/\s+/g, '-') === namePart.toUpperCase());

                processedBomboniereItems.push({ id: existingItemDef?.id || namePart, name: existingItemDef?.name || namePart, quantity: qty, price: price });
                totalPrice += price * qty;
                totalQuantity += qty;
                i++; 
            } else if (part.match(/^\d+[a-zA-Z]+/) && i + 1 < parts.length && isNumeric(parts[i+1])) {
                try {
                    const { itemName, customPrice } = await parseCustomItemPrice({ itemName: `${part} ${parts[i+1]}`.trim() });
                    if (customPrice !== undefined) {
                        const bomboniereMatch = itemName.match(/^(\d*)([A-Z\d\s-]+)$/i);
                        const qty = bomboniereMatch && bomboniereMatch[1] ? parseInt(bomboniereMatch[1], 10) : 1;
                        const name = bomboniereMatch ? bomboniereMatch[2] : itemName;
                        const existingItemDef = bomboniereItems?.find(bi => bi.name.toUpperCase().replace(/\s+/g, '-') === name.toUpperCase());

                        processedBomboniereItems.push({ id: existingItemDef?.id || name, name: existingItemDef?.name || name, quantity: qty, price: customPrice });
                        totalPrice += customPrice * qty;
                        totalQuantity += qty;
                        i++; 
                    }
                } catch(e) {
                    console.error("AI parsing failed, skipping part:", part, e);
                }
            } else if (!isNumeric(part) && /^[a-zA-Z\s]+$/.test(part) && (group.startsWith('Fiado') || !customerName)) {
                potentialCustomerNameParts.push(part);
            }
        }
        
        if (!customerName && potentialCustomerNameParts.length > 0) {
            customerName = potentialCustomerNameParts.join(' ');
        }
        
        if (predefinedItems.length === 0 && individualPrices.length === 0 && processedBomboniereItems.length === 0) {
            toast({ variant: "destructive", title: "Entrada inválida", description: "Nenhum item válido foi encontrado."});
            setIsProcessing(false);
            return;
        };

        if (originalGroup === null && predefinedItems.length === 0 && individualPrices.length === 0 && processedBomboniereItems.length > 0) {
            group = 'Vendas salão';
            deliveryFeeApplicable = false;
        }

        if (bomboniereItems) { 
          const bomboniereCollectionRef = collection(firestore, "bomboniere_items");
          processedBomboniereItems.forEach(soldItem => {
              const itemDef = bomboniereItems.find(i => i.id === soldItem.id);
              if (itemDef) {
                  const newStock = itemDef.estoque - soldItem.quantity;
                  const docRef = doc(bomboniereCollectionRef, itemDef.id);
                  updateDocumentNonBlocking(docRef, { estoque: newStock });
              }
          });
        }

        const deliveryFee = isTaxExempt ? 0 : (customDeliveryFee !== null ? customDeliveryFee : (deliveryFeeApplicable ? DELIVERY_FEE : 0));
        const total = totalPrice + deliveryFee;
        
        let consolidatedName: string;
        const hasKgItems = individualPrices.length > 0;
        const hasPredefinedItems = predefinedItems.length > 0;
        const hasBomboniereItems = processedBomboniereItems.length > 0;

        const nameParts = [];
        if (hasPredefinedItems) nameParts.push(predefinedItems.map(p => p.name).join(' '));
        if (hasKgItems) nameParts.push('KG');
        if (hasBomboniereItems) nameParts.push(processedBomboniereItems.map(item => `${item.quantity > 1 ? item.quantity : ''}${item.name}`).join(' '));
        
        consolidatedName = nameParts.join(' + ') || 'Lançamento';
        if (consolidatedName.length > 50) consolidatedName = 'Lançamento Misto';
        
        const finalItem: Item = {
            id: currentItem?.id || String(Date.now()),
            userId: user.uid,
            name: consolidatedName,
            quantity: totalQuantity,
            price: totalPrice,
            group,
            timestamp: new Date().toISOString(),
            deliveryFee,
            total,
            originalCommand: rawInputToProcess,
            reportado: false,
            ...(customerName && { customerName }),
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
            ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
            ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
        };
        
        if (currentItem?.id) {
            setItems(prev => prev.map(it => it.id === currentItem.id ? finalItem : it));
            toast({
                duration: 4000,
                component: <ToastContent item={finalItem} title="Lançamento Atualizado" />,
            });
        } else {
            setItems(prev => [...prev, finalItem]);
            toast({
                duration: 4000,
                component: <ToastContent item={finalItem} title="Lançamento Adicionado" />,
            });
        }
        
    } catch (error) {
        console.error("Error upserting item:", error);
        toast({
            variant: "destructive",
            title: "Erro ao processar item",
            description: "Ocorreu um problema ao processar o lançamento.",
        });
    } finally {
        setIsProcessing(false);
        setRawInput("");
        setItemToEdit(null);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
    }
  };

  const handleBomboniereAdd = (itemsToAdd: SelectedBomboniereItem[]) => {
      if (!bomboniereItems) return;
      const itemsString = itemsToAdd.map(item => {
        const qtyPart = item.quantity > 1 ? item.quantity : '';
        const namePart = bomboniereItems.find(bi => bi.id === item.id)?.name.replace(/\s+/g, '-').toLowerCase() || item.name;
        return `${qtyPart}${namePart} ${String(item.price).replace('.', ',')}`;
      }).join(' ');

      setBomboniereModalOpen(false);

      if (rawInput.trim() === '') {
        handleUpsertItem(itemsString);
      } else {
        setRawInput(prev => `${prev} ${itemsString}`.trim());
        setTimeout(() => inputRef.current?.focus(), 0);
      }
  }

  const handleItemFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawInput.trim()) return;
    await handleUpsertItem(rawInput, itemToEdit);
  };
  
  const handleDeleteRequest = (id: string) => {
    setItemToDelete(id);
  };

  const confirmDeleteItem = async () => {
    if (!firestore || !user?.uid || !itemToDelete || !items) return;

    const itemBeingDeleted = items.find(it => it.id === itemToDelete);

    if (itemBeingDeleted && itemBeingDeleted.bomboniereItems && bomboniereItems) {
        const bomboniereCollectionRef = collection(firestore, "bomboniere_items");
        for (const soldItem of itemBeingDeleted.bomboniereItems) {
            const itemDef = bomboniereItems.find(i => i.id === soldItem.id);
            if (itemDef) {
                const newStock = itemDef.estoque + soldItem.quantity;
                const docRef = doc(bomboniereCollectionRef, itemDef.id);
                updateDocumentNonBlocking(docRef, { estoque: newStock });
            }
        }
    }
    
    setItems(prev => prev.filter(it => it.id !== itemToDelete));

    toast({ title: "Item removido com sucesso.", variant: "destructive" });
    setItemToDelete(null);
  };
  
  const handleEditRequest = (item: Item) => {
    setItemToEdit(item);
    setRawInput(item.originalCommand || "");
    inputRef.current?.focus();
  };

  const handleFavoriteSelect = (favorite: SavedFavorite) => {
    handleUpsertItem(favorite.command, null, favorite.name);
  }
  
  const handleFavoriteSave = (item: Item) => {
    if (!item.originalCommand) return;
    const name = prompt("Insira um nome para este favorito:", item.customerName || "");
    if (name) {
      const newFavorite: SavedFavorite = {
        id: String(Date.now()),
        name,
        command: item.originalCommand,
      };
      setSavedFavorites(prev => [...prev, newFavorite]);
      toast({ title: 'Favorito guardado!', description: `O pedido de "${name}" foi guardado.` });
    }
  };

  const handleFavoriteDelete = (id: string) => {
    setSavedFavorites(prev => prev.filter(f => f.id !== id));
    toast({ title: 'Favorito removido.', variant: 'destructive' });
  }

  const handleSaveReport = async () => {
    if (!user || !firestore || !items || items.length === 0) {
      toast({ variant: 'destructive', title: 'Impossível Salvar', description: 'Não há itens para gerar o relatório.' });
      return;
    }
    setIsSavingReport(true);
  
    try {
      const reportDate = format(new Date(), 'yyyy-MM-dd');
      
      const itemsToReport = items.map(item => ({
          ...item,
          timestamp: serverTimestamp(), // Will be converted by Firestore
          reportado: true,
      }))
      
      const report: DailyReport = {
        userId: user.uid,
        reportDate: reportDate,
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
        contagemRua: totals.contagemRua
      };
      
      const reportRef = doc(collection(firestore, 'users', user.uid, 'daily_reports'));
      const batch = writeBatch(firestore);

      batch.set(reportRef, report);

      itemsToReport.forEach(item => {
        const itemRef = doc(collection(firestore, 'users', user.uid, 'order_items'));
        batch.set(itemRef, item);
      });
      
      await commitBatch(batch);

      setItems([]); // Clear local items after successful save

      toast({
        title: 'Relatório Salvo!',
        description: 'O relatório do dia foi salvo e os itens arquivados no Firestore.',
      });

    } catch (error) {
      console.error('Error saving report:', error);
      if (!(error instanceof FirestorePermissionError)) {
        toast({
          variant: 'destructive',
          title: 'Erro ao Salvar',
          description: 'Não foi possível salvar o relatório ou arquivar os itens.',
        });
      }
    } finally {
      setIsSavingReport(false);
    }
  };

  const totals = useMemo(() => {
    if (!items || items.length === 0) {
      return {
        totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0,
        totalVendasRua: 0, totalFiadoSalao: 0, totalFiadoRua: 0, totalKg: 0, totalTaxas: 0,
        totalBomboniereSalao: 0, totalBomboniereRua: 0, totalItens: 0,
        totalPedidos: 0, totalEntregas: 0, totalItensRua: 0,
        contagemTotal: {} as ItemCount, contagemRua: {} as ItemCount,
      };
    }
  
    const result = items.reduce((acc, item) => {
      acc.totalGeral += item.total;
      acc.totalItens += item.quantity;
      acc.totalTaxas += item.deliveryFee;
      
      const itemIsRua = item.group === 'Vendas rua' || item.group === 'Fiados rua';
      if (itemIsRua) {
        acc.totalEntregas++;
        acc.totalItensRua += item.quantity;
      }
      
      if(item.group === 'Fiados salão' || item.group === 'Fiados rua') {
        acc.totalFiado += item.total;
      } else {
        acc.totalAVista += item.total;
      }
  
      switch (item.group) {
        case 'Vendas salão': acc.totalVendasSalao += item.total; break;
        case 'Vendas rua': acc.totalVendasRua += item.total; break;
        case 'Fiados salão': acc.totalFiadoSalao += item.total; break;
        case 'Fiados rua': acc.totalFiadoRua += item.total; break;
      }
  
      const itemsToCount = [
        ...(item.predefinedItems?.map(i => ({...i, count: 1})) || []),
        ...(item.bomboniereItems?.map(i => ({ name: i.name, count: i.quantity })) || []),
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
    }, {
      totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0,
      totalVendasRua: 0, totalFiadoSalao: 0, totalFiadoRua: 0, totalKg: 0, totalTaxas: 0,
      totalBomboniereSalao: 0, totalBomboniereRua: 0, totalItens: 0,
      totalPedidos: 0, totalEntregas: 0, totalItensRua: 0,
      contagemTotal: {} as ItemCount, contagemRua: {} as ItemCount,
    });
  
    return result;
  }, [items]);
  
  const hasUnsavedChanges = items.length > 0;
  
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
              if(!isOpen && passwordPrompt.onCancel) {
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
              Esta ação não pode ser desfeita. O item será excluído permanentemente da lista local e da base de dados (se já sincronizado). Se contiver itens de bomboniere, o estoque será devolvido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-36">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left flex-grow">
              <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary" />
              <p className="text-muted-foreground -mt-2 text-sm sm:text-base">Controle de Pedidos</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
                 <Button 
                    variant="outline"
                    onClick={() => handleProtectedAction(() => router.push('/reports'))}
                    className="w-1/2 sm:w-auto"
                  >
                    <History className="mr-2 h-4 w-4"/>
                    Relatórios
                 </Button>
                 <Button
                    variant="outline"
                    onClick={() => handleProtectedAction(() => router.push('/admin'))}
                    className="w-1/2 sm:w-auto"
                 >
                    <Wrench className="mr-2 h-4 w-4"/>
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
            <FavoritesMenu 
              savedFavorites={savedFavorites}
              onSelect={handleFavoriteSelect} 
              onDelete={handleFavoriteDelete} 
            />
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
              isLoading={isLoadingItems}
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
                    <span className="font-bold text-foreground">{totals.totalEntregas} ({formatCurrency(totals.totalTaxas)})</span>
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
                    {isSavingReport ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4" />}
                </Button>
            </div>
        </div>
      </footer>
    </>
  );
}

function AuthWall({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading, userError } = useUser();
  
  const isReady = !isUserLoading && user && user.isAnonymous;

  if (!isReady) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center text-center p-4">
        <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary mb-4" />
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">A aguardar autenticação...</p>
        {userError && (
            <>
                <p className="mt-4 text-destructive font-semibold">Erro de Autenticação</p>
                <p className="mt-2 text-muted-foreground text-sm max-w-md">{userError.message}</p>
            </>
        )}
      </div>
    );
  }
  
  return <>{children}</>;
}


export default function Home() {
  return (
    <AuthWall>
      <LancheTrackerPage />
    </AuthWall>
  );
}
