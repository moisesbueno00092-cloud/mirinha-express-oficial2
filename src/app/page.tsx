
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from 'next/navigation';
import type { Item, Group, PredefinedItem, SelectedBomboniereItem, BomboniereItem, FavoriteClient, DailyReport, ItemCount } from "@/types";
import { PREDEFINED_PRICES, DELIVERY_FEE, BOMBONIERE_ITEMS_DEFAULT } from "@/lib/constants";
import { useAuth, useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, doc, query, where, orderBy, deleteDoc, writeBatch, addDoc } from "firebase/firestore";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";
import Link from 'next/link';

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
import { Save, Loader2, History } from "lucide-react";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import ItemList from "@/components/item-list";
import BomboniereModal from "@/components/bomboniere-modal";
import MirinhaLogo from "@/components/mirinha-logo";
import FavoritesMenu from "@/components/favorites-menu";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { Separator } from "@/components/ui/separator";

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
  const [rawInput, setRawInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [isSaveFavoriteOpen, setIsSaveFavoriteOpen] = useState(false);
  const [itemToSaveAsFavorite, setItemToSaveAsFavorite] = useState<Item | null>(null);
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteToDelete, setFavoriteToDelete] = useState<string | null>(null);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

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

                processedBomboniereItems.push({ id: existingItemDef?.id || namePart, name: namePart, quantity: qty, price: price });
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

                        processedBomboniereItems.push({ id: existingItemDef?.id || name, name, quantity: qty, price: customPrice });
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
                  const newStock = itemDef.stock - soldItem.quantity;
                  const docRef = doc(bomboniereCollectionRef, itemDef.id);
                  updateDocumentNonBlocking(docRef, { stock: newStock });
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
        if (hasBomboniereItems) nameParts.push(processedBomboniereItems.map(item => `${item.quantity > 1 ? item.quantity : ''}${item.name.replace(/\s+/g, '-')}`).join(' '));
        
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
            setDocumentNonBlocking(docRef, finalItem, { merge: true });
            toast({ title: "Sucesso", description: "Lançamento atualizado." });
        } else {
            addDocumentNonBlocking(orderItemsCollectionRef, finalItem);
            toast({ title: "Sucesso", description: "Lançamento adicionado." });
        }
        
        setRawInput("");

    } catch (error) {
        console.error("Error upserting item:", error);
        toast({
            variant: "destructive",
            title: "Erro ao processar item",
            description: "Ocorreu um problema ao processar o lançamento.",
        });
    } finally {
        setIsProcessing(false);
        if (editingItem) {
          setEditingItem(null);
        } else {
          setRawInput("");
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }
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

  const confirmSaveFavorite = () => {
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
    toast({ title: 'Sucesso', description: 'Favorito removido.' });
    setFavoriteToDelete(null);
  };

  const handleEditRequest = (item: Item) => {
    setEditingItem(item);
    setEditInputValue(item.originalCommand || '');
  };

  const handleSaveEdit = () => {
    if(editingItem && editInputValue) {
      handleUpsertItem(editInputValue, editingItem)
    }
  }
  
  const summary = useMemo(() => {
    if (!items) {
      return { total: 0, totalAVista: 0, totalFiado: 0, totalEntregas: 0, totalTaxas: 0 };
    }

    let total = 0;
    let totalAVista = 0;
    let totalFiado = 0;
    let totalEntregas = 0;
    let totalTaxas = 0;
    
    items.forEach(item => {
      total += item.total;
      if (item.group.includes('Fiados')) {
        totalFiado += item.total;
      } else {
        totalAVista += item.total;
      }
      if (item.group.includes('rua') || item.deliveryFee > 0) {
        totalEntregas += 1;
      }
      totalTaxas += item.deliveryFee || 0;
    });

    return { total, totalAVista, totalFiado, totalEntregas, totalTaxas };
  }, [items]);

  const reportData = useMemo(() => {
    if (!items) return null;

    let totalVendasSalao = 0, totalVendasRua = 0, totalFiadoSalao = 0, totalFiadoRua = 0;
    let totalKgValue = 0, totalTaxas = 0, totalEntregas = 0;
    let totalBomboniereSalao = 0, totalBomboniereRua = 0;
    
    let totalItensRua = 0;
    let contagemTotal: ItemCount = {};
    let contagemRua: ItemCount = {};

    items.forEach(item => {
      const group = item.group || '';
      
      if (group === 'Vendas salão') totalVendasSalao += item.total || 0;
      else if (group === 'Vendas rua') totalVendasRua += item.total || 0;
      else if (group === 'Fiados salão') totalFiadoSalao += item.total || 0;
      else if (group === 'Fiados rua') totalFiadoRua += item.total || 0;

      totalTaxas += item.deliveryFee || 0;
      if (item.deliveryFee > 0 || group.includes('rua')) totalEntregas += 1;

      const processItemCounts = (itemSource: { name: string, quantity: number }[], isRua: boolean) => {
        const targetCount = isRua ? contagemRua : contagemTotal;
        itemSource.forEach(p => {
          const name = p.name.toUpperCase().replace(/^\d+/, '').replace(/\s+/g, '');
          targetCount[name] = (targetCount[name] || 0) + p.quantity;
          if (isRua) totalItensRua += p.quantity;
        });
      };
      
      const isRua = group.includes('rua');
      
      if (item.predefinedItems) {
        const aggregatedPredefined: { [key:string]: {name: string, quantity: number} } = {};
        item.predefinedItems.forEach(p => {
            if (!aggregatedPredefined[p.name]) {
                aggregatedPredefined[p.name] = { name: p.name, quantity: 0 };
            }
            aggregatedPredefined[p.name].quantity++;
        });
        processItemCounts(Object.values(aggregatedPredefined), isRua);
      }
      
      if (item.individualPrices) {
        processItemCounts([{ name: 'KG', quantity: item.individualPrices.length }], isRua);
        item.individualPrices.forEach(price => totalKgValue += price);
      }
      
      if (item.bomboniereItems) {
        processItemCounts(item.bomboniereItems, isRua);
        item.bomboniereItems.forEach(b => {
          const bomboniereValue = b.price * b.quantity;
          if (isRua) {
            totalBomboniereRua += bomboniereValue;
          } else {
            totalBomboniereSalao += bomboniereValue;
          }
        });
      }
    });

    const totalItensSalao = Object.values(contagemTotal).reduce((sum, count) => sum + count, 0);
    const totalGeralItens = totalItensSalao + totalItensRua;

    const faturamentoTotal = totalVendasSalao + totalVendasRua + totalFiadoSalao + totalFiadoRua;

    return {
      faturamentoTotal, totalVendasSalao, totalVendasRua, totalFiadoSalao, totalFiadoRua,
      totalBomboniereSalao, totalBomboniereRua,
      totalKg: totalKgValue, totalTaxas, totalEntregas, totalGeralItens,
      totalItensRua, contagemTotal, contagemRua
    };
  }, [items]);

  const handleSaveReport = async () => {
    if (!firestore || !user || !reportData || items.length === 0) {
      toast({ variant: 'destructive', title: 'Não é possível gerar o relatório', description: 'Não há lançamentos para o dia atual.' });
      return;
    }
    
    setIsSavingReport(true);
    
    const newReportData: Omit<DailyReport, 'id'> = {
      userId: user.uid,
      reportDate: format(new Date(), 'yyyy-MM-dd'),
      createdAt: new Date().toISOString(),
      totalGeral: reportData.faturamentoTotal,
      totalAVista: reportData.totalVendasSalao + reportData.totalVendasRua,
      totalFiado: reportData.totalFiadoSalao + reportData.totalFiadoRua,
      totalVendasSalao: reportData.totalVendasSalao,
      totalVendasRua: reportData.totalVendasRua,
      totalFiadoSalao: reportData.totalFiadoSalao,
      totalFiadoRua: reportData.totalFiadoRua,
      totalKg: reportData.totalKg,
      totalBomboniereRua: reportData.totalBomboniereRua,
      totalBomboniereSalao: reportData.totalBomboniereSalao,
      totalTaxas: reportData.totalTaxas,
      totalItens: reportData.totalGeralItens,
      totalPedidos: items.length,
      totalEntregas: reportData.totalEntregas,
      totalItensRua: reportData.totalItensRua,
      contagemTotal: reportData.contagemTotal,
      contagemRua: reportData.contagemRua,
    };

    try {
      const reportsCollectionRef = collection(firestore, 'daily_reports');
      await addDoc(reportsCollectionRef, newReportData);

      const batch = writeBatch(firestore);
      items.forEach(item => {
        const docRef = doc(firestore, 'order_items', item.id);
        batch.delete(docRef);
      });
      await batch.commit();
      
      toast({ title: 'Sucesso', description: 'Relatório final salvo e lançamentos do dia limpos!' });

    } catch (error) {
      console.error("Error saving report and cleaning items:", error);
      toast({ variant: "destructive", title: "Erro ao salvar relatório.", description: "Os lançamentos não foram limpos." });
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleOpenReports = () => {
    setPasswordInput('');
    setIsPasswordModalOpen(true);
  }

  const handlePasswordSubmit = () => {
    if (passwordInput === 'mirinha') {
        setIsPasswordModalOpen(false);
        router.push('/reports');
    } else {
        toast({
            variant: 'destructive',
            title: 'Senha Incorreta',
            description: 'A senha para aceder aos relatórios está incorreta.'
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

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveEdit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
                <Button type="button" variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button type="submit" onClick={handleSaveEdit} disabled={isProcessing}>
                <Save className="mr-2 h-4 w-4" /> Salvar
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmSaveFavorite();
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
              Por favor, insira a senha para ver os relatórios salvos.
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
            <Button variant="outline" className="w-full md:w-auto" onClick={handleOpenReports}>
                <History className="mr-2 h-4 w-4" />
                Ver Relatórios Salvos
            </Button>
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto grid max-w-4xl grid-cols-[1fr_1fr_1.5fr] items-center gap-2 p-1 text-center text-[0.6rem]">
          <div className="flex flex-col items-center justify-center">
             <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">À Vista:</span>
                <span className="font-bold text-foreground">{formatCurrency(summary.totalAVista)}</span>
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

    