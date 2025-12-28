
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from 'next/navigation';
import type { Item, Group, PredefinedItem, SelectedBomboniereItem, BomboniereItem, FavoriteClient, DailyReport, ItemCount } from "@/types";
import { PREDEFINED_PRICES, DELIVERY_FEE, BOMBONIERE_ITEMS_DEFAULT } from "@/lib/constants";
import { useAuth, useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, doc, query, where, orderBy, deleteDoc, writeBatch, DocumentReference, addDoc, setDoc } from "firebase/firestore";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";

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
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, History, Settings, Wrench, X } from "lucide-react";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import ItemList, { renderItemName, groupBadgeStyles } from "@/components/item-list";
import BomboniereModal from "@/components/bomboniere-modal";
import StockEditModal from "@/components/stock-edit-modal";
import MirinhaLogo from "@/components/mirinha-logo";
import FavoritesMenu from "@/components/favorites-menu";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const isNumeric = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);


export default function Home() {
  const firestore = useFirestore();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  
  useEffect(() => {
    const ensureUser = async () => {
      if (!isUserLoading && !user && auth) {
        try {
          await signInWithEmailAndPassword(auth, 'user@lanche.net', 'palavrapasselanche');
        } catch (error: any) {
          if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
              await createUserWithEmailAndPassword(auth, 'user@lanche.net', 'palavrapasselanche');
            } catch (creationError) {
              console.error("Failed to create shared user:", creationError);
            }
          } else {
            console.error("Failed to sign in shared user:", error);
          }
        }
      }
    };
    ensureUser();
  }, [user, isUserLoading, auth]);

  const userOrderItemsQuery = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, "order_items"), where("userId", "==", user.uid)) : null),
    [firestore, user]
  );
  
  const bomboniereItemsRef = useMemoFirebase(() => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null), [firestore]);
  
  const favoriteClientsQuery = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, "favorite_clients"), where("userId", "==", user.uid)) : null),
    [firestore, user]
  );

  const { data: allItems, isLoading: isLoadingItems, error: firestoreError } = useCollection<Item>(userOrderItemsQuery);
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsRef);
  const { data: favoriteClients, isLoading: isLoadingFavorites } = useCollection<FavoriteClient>(favoriteClientsQuery);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editInputValue, setEditInputValue] = useState("");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isBomboniereModalOpen, setBomboniereModalOpen] = useState(false);
  const [isStockEditModalOpen, setIsStockEditModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [isSaveFavoriteOpen, setIsSaveFavoriteOpen] = useState(false);
  const [itemToSaveAsFavorite, setItemToSaveAsFavorite] = useState<Item | null>(null);
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteToDelete, setFavoriteToDelete] = useState<string | null>(null);
  
  const [lastAddedItem, setLastAddedItem] = useState<{ item: Item, title: string } | null>(null);
  const [justEditedItemId, setJustEditedItemId] = useState<string | null>(null);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordAction, setPasswordAction] = useState<'reports' | 'stock' | null>(null);


  const { toast } = useToast();

  const items = useMemo(() => {
    if (!allItems) return [];
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());
    return allItems.filter(item => {
      try {
        if (!item.timestamp) return false;
        return isWithinInterval(new Date(item.timestamp), { start, end });
      } catch (e) {
        return false;
      }
    });
  }, [allItems]);

  useEffect(() => {
    if (justEditedItemId && items) {
      const editedItem = items.find(i => i.id === justEditedItemId);
      if (editedItem) {
        setLastAddedItem({ item: editedItem, title: "Lançamento Atualizado" });
        setEditingItem(null); // Close the dialog here
        setJustEditedItemId(null); // Reset after showing notification
      }
    }
  }, [justEditedItemId, items]);
  
  useEffect(() => {
    if (firestore && !isLoadingBomboniere && bomboniereItems && bomboniereItems.length === 0) {
      const bomboniereCollectionRef = collection(firestore, 'bomboniere_items');
      BOMBONIERE_ITEMS_DEFAULT.forEach(item => {
        const { id, ...itemData } = item;
        const docRef = doc(bomboniereCollectionRef, id);
        setDocumentNonBlocking(docRef, itemData, { merge: true });
      });
    }
  }, [firestore, bomboniereItems, isLoadingBomboniere]);

  const handleUpsertItem = async (rawInputToProcess: string, currentItem?: Item | null, favoriteClient?: FavoriteClient) => {
    setIsProcessing(true);
    if (!user || !firestore) {
        toast({ variant: "destructive", title: "Erro", description: "Utilizador não autenticado." });
        setIsProcessing(false);
        return;
    }
    
    try {
        let mainInput = rawInputToProcess.trim();
        if (!mainInput) return;

        let group: Group = 'Vendas salão';
        
        let deliveryFeeApplicable = false;
        let isTaxExempt = false;
        let originalGroup: Group | null = null;
        let customerName: string | undefined = favoriteClient?.name;
        
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
            } else if (!customerName && !isNumeric(part) && /^[a-zA-Z\s]+$/.test(part) && (group.startsWith('Fiado'))) {
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

        if (!currentItem && bomboniereItems) { 
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

        const timestamp = new Date().toISOString();

        const finalItem: Omit<Item, 'id'> = {
            userId: user.uid,
            name: consolidatedName,
            quantity: totalQuantity,
            price: totalPrice,
            group,
            timestamp: timestamp,
            deliveryFee,
            total,
            originalCommand: rawInputToProcess,
            ...(customerName && { customerName }),
            ...(favoriteClient && { customerId: favoriteClient.id }),
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
            ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
            ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
        };

        const orderItemsCollectionRef = collection(firestore, "order_items");
        
        if (currentItem?.id) {
            const docRef = doc(orderItemsCollectionRef, currentItem.id);
            await setDoc(docRef, finalItem, { merge: true });
        } else {
            const displayTitle = "Lançamento Adicionado";
            const docRef = await addDoc(orderItemsCollectionRef, finalItem);
            setLastAddedItem({ item: { ...finalItem, id: docRef.id }, title: displayTitle });
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
        if (!currentItem) {
          setRawInput("");
        }
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setItemToDelete(id);
  };
  
  const confirmDelete = () => {
    if(!firestore || !itemToDelete || !user) return;
    const orderItemsCollectionRef = collection(firestore, "order_items");
    deleteDocumentNonBlocking(doc(orderItemsCollectionRef, itemToDelete));
    toast({
      title: "Sucesso",
      description: "Item removido.",
      variant: 'destructive'
    });
    setItemToDelete(null);
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
    await handleUpsertItem(rawInput);
  };
  
  const handleSaveFavoriteRequest = (item: Item) => {
    if (!item.originalCommand) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Este lançamento não pode ser salvo como favorito.' });
        return;
    }
    setItemToSaveAsFavorite(item);
    setFavoriteName(item.customerName || '');
    setIsSaveFavoriteOpen(true);
  };

  const confirmSaveFavorite = async () => {
    if (!firestore || !user || !itemToSaveAsFavorite || !favoriteName.trim() || !itemToSaveAsFavorite.originalCommand) return;
    
    const newFavorite: Omit<FavoriteClient, 'id'> = {
      userId: user.uid,
      name: favoriteName.trim(),
      command: itemToSaveAsFavorite.originalCommand,
    };
    
    const favClientsCollectionRef = collection(firestore, "favorite_clients");
    addDocumentNonBlocking(favClientsCollectionRef, newFavorite);
    toast({ title: 'Sucesso', description: `"${favoriteName.trim()}" foi salvo como favorito.` });
    setIsSaveFavoriteOpen(false);
  };
  
  const handleSelectFavorite = (client: FavoriteClient) => {
    handleUpsertItem(client.command, null, client);
  };
  
  const handleDeleteFavoriteRequest = (clientId: string) => {
    setFavoriteToDelete(clientId);
  };

  const confirmDeleteFavorite = () => {
    if (!firestore || !favoriteToDelete || !user) return;
    const docRef = doc(firestore, "favorite_clients", favoriteToDelete);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Sucesso', description: 'Favorito removido.', variant: 'destructive' });
    setFavoriteToDelete(null);
  };

  const handleEditRequest = (item: Item) => {
    setEditingItem(item);
    setEditInputValue(item.originalCommand || '');
  };

  const handleSaveEdit = async () => {
    if (editingItem && editInputValue) {
      await handleUpsertItem(editInputValue, editingItem);
      setJustEditedItemId(editingItem.id);
    }
  };
  
  const summary = useMemo(() => {
    if (!items) {
      return { total: 0, totalAVista: 0, totalFiado: 0, totalEntregas: 0, totalTaxas: 0 };
    }

    let total = 0;
    let totalFiado = 0;
    let totalEntregas = 0;
    let totalTaxas = 0;
    
    items.forEach(item => {
      total += item.total;
      if (item.group.includes('Fiados')) {
        totalFiado += item.total;
      }
      if (item.group.includes('rua') || item.deliveryFee > 0) {
        totalEntregas += 1;
      }
      totalTaxas += item.deliveryFee || 0;
    });

    const totalAVista = total - totalFiado - totalTaxas;

    return { total, totalAVista, totalFiado, totalEntregas, totalTaxas };
  }, [items]);

  const handleSaveReport = async () => {
    if (!firestore || !user || items.length === 0) {
      toast({ variant: 'destructive', title: 'Não é possível gerar o relatório', description: 'Não há lançamentos para o dia atual.' });
      return;
    }
    
    setIsSavingReport(true);
    
    let totalVendasSalao = 0, totalVendasRua = 0, totalFiadoSalao = 0, totalFiadoRua = 0;
    let totalKgValue = 0, totalTaxas = 0, totalEntregas = 0;
    let totalBomboniereSalao = 0, totalBomboniereRua = 0;
    
    const contagemTotal: ItemCount = {};
    const contagemRua: ItemCount = {};
  
    const processItemCounts = (item: Item, targetCount: ItemCount) => {
        if (item.predefinedItems) {
            item.predefinedItems.forEach(pItem => {
                const key = pItem.name.toUpperCase();
                targetCount[key] = (targetCount[key] || 0) + 1;
            });
        }
        if (item.individualPrices) {
            targetCount['KG'] = (targetCount['KG'] || 0) + item.individualPrices.length;
        }
        if (item.bomboniereItems) {
            item.bomboniereItems.forEach(bItem => {
                const key = bItem.name;
                targetCount[key] = (targetCount[key] || 0) + bItem.quantity;
            });
        }
    };

    items.forEach(item => {
        const group = item.group || '';
        const isRua = group.includes('rua');
      
        if (group === 'Vendas salão') totalVendasSalao += item.total || 0;
        else if (group === 'Vendas rua') totalVendasRua += item.total || 0;
        else if (group === 'Fiados salão') totalFiadoSalao += item.total || 0;
        else if (group === 'Fiados rua') totalFiadoRua += item.total || 0;
    
        totalTaxas += item.deliveryFee || 0;
        if (item.deliveryFee > 0 || isRua) totalEntregas += 1;
    
        const bomboniereValue = (item.bomboniereItems || []).reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
        if (isRua) {
            totalBomboniereRua += bomboniereValue;
        } else {
            totalBomboniereSalao += bomboniereValue;
        }
        
        if (item.individualPrices) {
            totalKgValue += item.individualPrices.reduce((acc, curr) => acc + curr, 0);
        }

        processItemCounts(item, contagemTotal);
        if (isRua) {
          processItemCounts(item, contagemRua);
        }
    });
  
    const totalItens = Object.values(contagemTotal).reduce((s, c) => s + c, 0);
    const totalItensRua = Object.values(contagemRua).reduce((s, c) => s + c, 0);
    const faturamentoTotal = totalVendasSalao + totalVendasRua + totalFiadoSalao + totalFiadoRua;
    const totalFiado = summary.totalFiado;
    const totalAVista = faturamentoTotal - totalFiado - totalTaxas;

    const newReportData: Omit<DailyReport, 'id'> = {
      userId: user.uid,
      reportDate: format(new Date(), 'yyyy-MM-dd'),
      createdAt: new Date().toISOString(),
      totalGeral: faturamentoTotal,
      totalAVista: totalAVista,
      totalFiado: totalFiado,
      totalVendasSalao: totalVendasSalao,
      totalVendasRua: totalVendasRua,
      totalFiadoSalao: totalFiadoSalao,
      totalFiadoRua: totalFiadoRua,
      totalKg: totalKgValue,
      totalTaxas: totalTaxas,
      totalBomboniereSalao,
      totalBomboniereRua,
      totalItens: totalItens,
      totalPedidos: items.length,
      totalEntregas: totalEntregas,
      totalItensRua: totalItensRua,
      contagemTotal: contagemTotal,
      contagemRua: contagemRua,
      items: items,
    };

    try {
      const reportsCollectionRef = collection(firestore, 'daily_reports');
      const contasAPagarCollectionRef = collection(firestore, 'contas_a_pagar');
      
      const batch = writeBatch(firestore);

      // 1. Save the new report
      const reportDocRef = doc(reportsCollectionRef); // Create a new doc ref for the report
      batch.set(reportDocRef, newReportData);

      // 2. Create the delivery fee expense
      if (totalTaxas > 0) {
          const despesaTaxa = {
              descricao: `Taxas de Entrega do Dia ${format(new Date(), 'dd/MM/yyyy')}`,
              fornecedorId: 'delivery_fees_provider',
              valor: totalTaxas,
              dataVencimento: format(new Date(), 'yyyy-MM-dd'),
              estaPaga: true,
          };
          const despesaDocRef = doc(contasAPagarCollectionRef); // Create a new doc ref for the expense
          batch.set(despesaDocRef, despesaTaxa);
      }

      // 3. Delete the day's items
      items.forEach(item => {
        const docRef = doc(firestore, 'order_items', item.id);
        batch.delete(docRef);
      });

      // 4. Commit all operations
      await batch.commit();
      
      toast({ title: 'Sucesso', description: 'Relatório final salvo, despesa de taxa criada e lançamentos do dia limpos!' });

    } catch (error) {
      console.error("Error saving report and cleaning items:", error);
      toast({ variant: "destructive", title: "Erro ao salvar relatório.", description: "Os lançamentos não foram limpos." });
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleOpenPasswordModal = (action: 'reports' | 'stock') => {
    setPasswordAction(action);
    setPasswordInput('');
    setIsPasswordModalOpen(true);
  }

  const handlePasswordSubmit = () => {
    if (passwordInput === 'jujubb3110') {
        setIsPasswordModalOpen(false);
        if (passwordAction === 'reports') {
          router.push('/reports');
        } else if (passwordAction === 'stock') {
          setIsStockEditModalOpen(true);
        }
    } else {
        toast({
            variant: 'destructive',
            title: 'Senha Incorreta',
            description: 'A senha para aceder a esta funcionalidade está incorreta.'
        })
    }
  }

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (firestoreError) {
    return (
      <div className="container mx-auto max-w-4xl p-8 text-center text-destructive">
        <h1 className="text-2xl font-bold">Erro de Conexão</h1>
        <p>Não foi possível conectar ao banco de dados.</p>
        <p className="text-sm text-muted-foreground mt-2">Por favor, verifique sua conexão com a internet e as configurações do Firebase.</p>
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o item. A quantidade em estoque não será devolvida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!favoriteToDelete} onOpenChange={(open) => !open && setFavoriteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Favorito?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o cliente favorito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFavorite}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingItem} onOpenChange={!isProcessing ? (open) => !open && setEditingItem(null) : undefined}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={editInputValue}
              onChange={(e) => setEditInputValue(e.target.value)}
              placeholder="Comando original..."
              className="h-10 flex-1 sm:h-12 text-base"
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  await handleSaveEdit();
                }
              }}
              disabled={isProcessing}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEditingItem(null)} disabled={isProcessing}>Cancelar</Button>
            <Button type="submit" onClick={handleSaveEdit} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                 Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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

      <Dialog open={isSaveFavoriteOpen} onOpenChange={setIsSaveFavoriteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar como Favorito</DialogTitle>
            <DialogDescription>
              Dê um nome para este cliente favorito. O comando "{itemToSaveAsFavorite?.originalCommand}" será salvo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="favorite-name" className="text-right">
                Nome
              </Label>
              <Input
                id="favorite-name"
                value={favoriteName}
                onChange={(e) => setFavoriteName(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') await confirmSaveFavorite();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveFavoriteOpen(false)}>Cancelar</Button>
            <Button onClick={confirmSaveFavorite} disabled={!favoriteName.trim()}>Salvar Favorito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso Restrito</DialogTitle>
            <DialogDescription>
              Por favor, insira a senha para continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePasswordSubmit();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancelar</Button>
            <Button onClick={handlePasswordSubmit}>Aceder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {lastAddedItem && (
        <div className="fixed bottom-24 right-4 z-50 w-full max-w-sm">
          <Card className="shadow-2xl border-primary/20 bg-card/95 backdrop-blur-sm">
            <CardHeader className="flex-row items-center justify-between p-3">
                <CardTitle className="text-base">{lastAddedItem.title}</CardTitle>
                <button onClick={() => setLastAddedItem(null)} className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                   <X className="h-4 w-4" />
                   <span className="sr-only">Fechar</span>
                </button>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                <div className="flex flex-col gap-1.5">
                  {renderItemName(lastAddedItem.item)}
                  <div className={cn("whitespace-nowrap w-fit px-2.5 py-0.5 text-xs font-semibold rounded-full", groupBadgeStyles[lastAddedItem.item.group] || "bg-gray-500")}>
                    {lastAddedItem.item.group}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-xl text-primary">{formatCurrency(lastAddedItem.item.total)}</div>
                  {lastAddedItem.item.deliveryFee > 0 && <div className="text-xs text-muted-foreground">Taxa: {formatCurrency(lastAddedItem.item.deliveryFee)}</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-36">
        <header className="mb-6 flex flex-col items-center justify-center text-center">
          <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary" />
          <p className="text-muted-foreground -mt-2 text-sm sm:text-base">Controle de Pedidos</p>
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
              favoriteClients={favoriteClients || []}
              onSelectClient={handleSelectFavorite}
              onDeleteClient={handleDeleteFavoriteRequest}
              isLoading={isLoadingFavorites}
             />
          </ItemForm>
          
          <Card>
            <CardContent className="p-2 sm:p-6">
              <ItemList
                items={items}
                onEdit={handleEditRequest}
                onDelete={handleDeleteRequest}
                isLoading={isLoadingItems}
                onSaveFavorite={handleSaveFavoriteRequest}
              />
            </CardContent>
          </Card>
        </main>

        <div className="mt-8 mb-24 flex flex-col gap-2 md:flex-row md:items-end md:justify-end">
            <Button 
                onClick={handleSaveReport}
                disabled={isSavingReport || isLoadingItems || items.length === 0}
                className="w-full md:w-auto"
            >
                {isSavingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Relatório Final
            </Button>
            <Button variant="outline" className="w-full md:w-auto" onClick={() => handleOpenPasswordModal('reports')}>
                <History className="mr-2 h-4 w-4" />
                Ver Relatórios Salvos
            </Button>
            <Button variant="outline" className="w-full md:w-auto" onClick={() => handleOpenPasswordModal('stock')}>
                <Settings className="mr-2 h-4 w-4" />
                Gerir Estoque
            </Button>
             <Button variant="outline" className="w-full md:w-auto" onClick={() => router.push('/admin')}>
                <Wrench className="mr-2 h-4 w-4" />
                Gestão Administrativa
            </Button>
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto grid max-w-4xl grid-cols-[1fr_1fr_1.5fr] items-center gap-2 p-1 text-center text-[0.6rem]">
          <div className="flex flex-col items-center justify-center">
             <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">À Vista:</span>
                <span className="font-bold text-green-500">{formatCurrency(summary.totalAVista)}</span>
             </div>
             <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Fiado:</span>
                <span className="font-bold text-destructive">{formatCurrency(summary.totalFiado)}</span>
             </div>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-r border-border/50 h-full">
            <span className="text-muted-foreground">Entregas</span>
            <span className="font-bold text-foreground">{summary.totalEntregas} ({formatCurrency(summary.totalTaxas)})</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-primary/10 p-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary/80">Total</span>
            <span className="text-base font-bold text-primary">{formatCurrency(summary.total)}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
