
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from 'next/navigation';
import type { Item, Group, PredefinedItem, SelectedBomboniereItem, BomboniereItem, DailyReport, ItemCount, SavedFavorite } from "@/types";
import { PREDEFINED_PRICES, DELIVERY_FEE, BOMBONIERE_ITEMS_DEFAULT } from "@/lib/constants";
import { useAuth, useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, doc, query, where, orderBy, deleteDoc, writeBatch, DocumentReference, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
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
import { Save, Loader2, History, Settings, Wrench, Users, Star, PiggyBank, Info } from "lucide-react";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import ItemList from "@/components/item-list";
import BomboniereModal from "@/components/bomboniere-modal";
import StockEditModal from "@/components/stock-edit-modal";
import MirinhaLogo from "@/components/mirinha-logo";
import FavoritesMenu from "@/components/favorites-menu";
import { signInAnonymously } from "firebase/auth";
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

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


export default function Home() {
  const firestore = useFirestore();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  
  useEffect(() => {
    if (!isUserLoading && !user && auth) {
      signInAnonymously(auth).catch((error) => {
        console.error("Anonymous sign-in failed:", error);
      });
    }
  }, [user, isUserLoading, auth]);

  const bomboniereItemsRef = useMemoFirebase(() => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null), [firestore]);
  
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsRef);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isBomboniereModalOpen, setBomboniereModalOpen] = useState(false);
  const [isStockEditModalOpen, setIsStockEditModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordAction, setPasswordAction] = useState<'reports' | 'stock' | null>(null);

  const [savedFavorites, setSavedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);
  
  const { toast } = useToast();

  const userOrderItemsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'order_items'), where('userId', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: items, isLoading: isLoadingItems } = useCollection<Item>(userOrderItemsQuery);

  const todaysItems = useMemo(() => {
    if (!items) return [];
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    return items.filter(item => {
        try {
            const itemDate = new Date(item.timestamp);
            return isWithinInterval(itemDate, { start: todayStart, end: todayEnd });
        } catch {
            return false;
        }
    });
  }, [items]);
  
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

  const handleUpsertItem = async (rawInputToProcess: string, currentItem?: Item | null, favoriteName?: string) => {
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

        const timestamp = new Date();

        const finalItem: Omit<Item, 'id' | 'timestamp'> & { timestamp: string } = {
            userId: user.uid,
            name: consolidatedName,
            quantity: totalQuantity,
            price: totalPrice,
            group,
            timestamp: timestamp.toISOString(),
            deliveryFee,
            total,
            originalCommand: rawInputToProcess,
            ...(customerName && { customerName }),
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
            ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
            ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
        };

        const orderItemsCollectionRef = collection(firestore, "order_items");
        
        if (currentItem) {
            const docRef = doc(orderItemsCollectionRef, currentItem.id);
            await setDocumentNonBlocking(docRef, { ...finalItem, timestamp: serverTimestamp() }, { merge: true });
             toast({
                duration: 4000,
                component: <ToastContent item={{...finalItem, id: currentItem.id }} title="Lançamento Atualizado" />,
            });
            setItemToEdit(null);
        } else {
            const docRef = await addDoc(orderItemsCollectionRef, { ...finalItem, timestamp: serverTimestamp()});
            toast({
                duration: 4000,
                component: <ToastContent item={{...finalItem, id: docRef.id }} title="Lançamento Adicionado" />,
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
  
  const handleEditItem = (item: Item) => {
    setRawInput(item.originalCommand || "");
    setItemToEdit(item);
    inputRef.current?.focus();
  };

  const handleDeleteItem = async () => {
    if (!firestore || !itemToDelete) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, "order_items", itemToDelete));
      toast({
        title: "Item Excluído",
        description: "O lançamento foi removido com sucesso.",
        variant: "destructive",
      });
    } catch (error) {
      console.error("Error deleting item:", error);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o item."});
    } finally {
      setItemToDelete(null);
    }
  };

  const handleFavorite = (item: Item) => {
    if (!item.originalCommand) {
      toast({ variant: 'destructive', title: 'Não é possível favoritar', description: 'Este item não tem um comando original para guardar.'});
      return;
    }

    const isAlreadyFavorited = savedFavorites.some(fav => fav.command === item.originalCommand);
    if(isAlreadyFavorited) {
        toast({ variant: 'destructive', title: 'Já é Favorito', description: 'Este lançamento já está na sua lista de favoritos.'});
        return;
    }

    const favoriteName = item.customerName || `Favorito ${savedFavorites.length + 1}`;
    const newFavorite: SavedFavorite = {
      id: String(Date.now()),
      name: favoriteName,
      command: item.originalCommand
    }
    setSavedFavorites(prev => [...prev, newFavorite]);
    toast({ title: 'Adicionado aos Favoritos!', description: `"${favoriteName}" foi guardado.`});
  }
  
  const handleFavoriteSelect = (favorite: SavedFavorite) => {
    handleUpsertItem(favorite.command, null, favorite.name);
  }

  const handleFavoriteDelete = (id: string) => {
    setSavedFavorites(prev => prev.filter(f => f.id !== id));
    toast({ title: 'Favorito removido.', variant: 'destructive' });
  }

  const handleSaveReport = async () => {
    if (!user || !firestore || !todaysItems || todaysItems.length === 0) {
      toast({ variant: 'destructive', title: 'Impossível Salvar', description: 'Não há lançamentos para gerar um relatório.' });
      return;
    }
    setIsSavingReport(true);

    try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        const totalGeral = todaysItems.reduce((acc, item) => acc + item.total, 0);
        const totalAVista = todaysItems.filter(i => i.group.startsWith('Vendas')).reduce((acc, item) => acc + item.total, 0);
        const totalFiado = totalGeral - totalAVista;

        const totalVendasSalao = todaysItems.filter(i => i.group === 'Vendas salão').reduce((acc, item) => acc + item.total, 0);
        const totalVendasRua = todaysItems.filter(i => i.group === 'Vendas rua').reduce((acc, item) => acc + item.total, 0);
        const totalFiadoSalao = todaysItems.filter(i => i.group === 'Fiados salão').reduce((acc, item) => acc + item.total, 0);
        const totalFiadoRua = todaysItems.filter(i => i.group === 'Fiados rua').reduce((acc, item) => acc + item.total, 0);

        const totalKg = todaysItems.filter(i => i.name === 'KG').reduce((acc, item) => acc + item.price, 0);
        const totalTaxas = todaysItems.reduce((acc, item) => acc + item.deliveryFee, 0);

        const contagemTotal: ItemCount = {};
        const contagemRua: ItemCount = {};
        let totalBomboniereSalao = 0;
        let totalBomboniereRua = 0;
        let totalItens = 0;
        let totalItensRua = 0;

        todaysItems.forEach(item => {
            const itensDoPedido = [...(item.predefinedItems || []), ...(item.bomboniereItems || []), ...(item.individualPrices ? item.individualPrices.map(p => ({name: 'KG', price: p})) : [])];
            totalItens += item.quantity;
            if (item.group.includes('rua')) {
                totalItensRua += item.quantity;
            }

            itensDoPedido.forEach(subItem => {
                const name = subItem.name;
                const count = (subItem as any).quantity || 1;
                
                contagemTotal[name] = (contagemTotal[name] || 0) + count;
                if (item.group.includes('rua')) {
                    contagemRua[name] = (contagemRua[name] || 0) + count;
                }
                
                const bomboniereDef = bomboniereItems?.find(bi => bi.name === name || bi.id === name);
                if (bomboniereDef) {
                  const valor = subItem.price * count;
                  if (item.group.includes('rua')) {
                    totalBomboniereRua += valor;
                  } else {
                    totalBomboniereSalao += valor;
                  }
                }
            });
        });

        const report: DailyReport = {
            userId: user.uid,
            reportDate: todayStr,
            createdAt: new Date().toISOString(),
            totalGeral, totalAVista, totalFiado,
            totalVendasSalao, totalVendasRua, totalFiadoSalao, totalFiadoRua,
            totalKg, totalTaxas, totalBomboniereSalao, totalBomboniereRua,
            totalItens, totalPedidos: todaysItems.length,
            totalEntregas: todaysItems.filter(i => i.group.includes('rua')).length,
            totalItensRua,
            contagemTotal,
            contagemRua,
        };

        const reportsCollectionRef = collection(firestore, 'daily_reports');
        await addDocumentNonBlocking(reportsCollectionRef, report);

        toast({ title: "Relatório Salvo!", description: "O resumo do dia foi guardado com sucesso." });
        
        // Clear today's items
        const batch = writeBatch(firestore);
        todaysItems.forEach(item => {
            const docRef = doc(firestore, 'order_items', item.id);
            batch.delete(docRef);
        });
        await batch.commit();
        
    } catch(e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Erro ao Salvar', description: 'Não foi possível salvar o relatório.' });
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

  const { totalAVista, totalFiado, totalEntregas, valorEntregas, totalGeral } = useMemo(() => {
    const safeItems = Array.isArray(todaysItems) ? todaysItems : [];
    const totalAVista = safeItems.filter(i => i.group.startsWith('Vendas')).reduce((acc, i) => acc + i.total, 0);
    const totalFiado = safeItems.filter(i => i.group.startsWith('Fiados')).reduce((acc, i) => acc + i.total, 0);
    const entregas = safeItems.filter(i => i.group.includes('rua'));
    const totalEntregas = entregas.length;
    const valorEntregas = entregas.reduce((acc, i) => acc + i.deliveryFee, 0);
    const totalGeral = totalAVista + totalFiado;
    return { totalAVista, totalFiado, totalEntregas, valorEntregas, totalGeral };
  }, [todaysItems]);
  
  
  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
      
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lançamento será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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
      
      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-36">
        <header className="mb-6 flex items-center justify-between">
            <div className="flex flex-col items-center justify-center text-center flex-grow">
              <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary" />
              <p className="text-muted-foreground -mt-2 text-sm sm:text-base">Controle de Pedidos</p>
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
          
          <Card>
            <CardHeader>
              <CardTitle>Lançamentos do Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemList 
                  items={todaysItems}
                  onEdit={handleEditItem}
                  onDelete={(id) => setItemToDelete(id)}
                  onFavorite={handleFavorite}
                  savedFavorites={savedFavorites}
                  isLoading={isLoadingItems}
              />
            </CardContent>
          </Card>
        </main>

        <div className="mt-8 mb-24 grid grid-cols-2 md:grid-cols-3 gap-2">
            <Button 
                onClick={handleSaveReport}
                disabled={isSavingReport || !todaysItems || todaysItems.length === 0}
                className="w-full"
            >
                {isSavingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Relatório
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push('/reports')}>
                <History className="mr-2 h-4 w-4" />
                Relatórios Salvos
            </Button>
            <Button variant="outline" className="w-full" onClick={() => handleOpenPasswordModal('stock')}>
                <Settings className="mr-2 h-4 w-4" />
                Gerir Estoque
            </Button>
             <Button variant="outline" className="w-full col-span-2 md:col-span-3" onClick={() => router.push('/admin')}>
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
                <span className="font-bold text-green-500">{formatCurrency(totalAVista)}</span>
             </div>
             <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Fiado:</span>
                <span className="font-bold text-destructive">{formatCurrency(totalFiado)}</span>
             </div>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-r border-border/50 h-full">
            <span className="text-muted-foreground">Entregas</span>
            <span className="font-bold text-foreground">{totalEntregas} ({formatCurrency(valorEntregas)})</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-primary/10 p-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary/80">Total</span>
            <span className="text-base font-bold text-primary">{formatCurrency(totalGeral)}</span>
          </div>
        </div>
      </footer>
    </>
  );
}

    