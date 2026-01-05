
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from 'next/navigation';
import type { Item, Group, PredefinedItem, SelectedBomboniereItem, BomboniereItem, DailyReport, ItemCount, SavedFavorite, User } from "@/types";
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
import BomboniereModal from "@/components/bomboniere-modal";
import StockEditModal from "@/components/stock-edit-modal";
import MirinhaLogo from "@/components/mirinha-logo";
import FavoritesMenu from "@/components/favorites-menu";
import { format, isToday, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import ItemList from "@/components/item-list";

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


function LancheTrackerPage({ user }: { user: User }) {
  const firestore = useFirestore();
  const router = useRouter();

  const bomboniereItemsRef = useMemoFirebase(() => (firestore ? query(collection(firestore, 'bomboniere_items'), orderBy('name', 'asc')) : null), [firestore]);
  
  const userOrderItemsQuery = useMemoFirebase(
    () => (firestore && user?.uid ? query(collection(firestore, 'order_items'), where('userId', '==', user.uid), orderBy('timestamp', 'desc')) : null),
    [firestore, user?.uid]
  );
  
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsRef);
  const { data: items, isLoading: isLoadingItems } = useCollection<Item>(userOrderItemsQuery);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isBomboniereModalOpen, setBomboniereModalOpen] = useState(false);
  const [isStockEditModalOpen, setIsStockEditModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordAction, setPasswordAction] = useState<'reports' | 'stock' | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);

  const [savedFavorites, setSavedFavorites] = usePersistentState<SavedFavorite[]>('savedFavorites', []);
  
  const { toast } = useToast();

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

        const finalItem: Omit<Item, 'id' | 'timestamp'> & { timestamp: Timestamp } = {
            userId: user.uid,
            name: consolidatedName,
            quantity: totalQuantity,
            price: totalPrice,
            group,
            timestamp: serverTimestamp() as Timestamp,
            deliveryFee,
            total,
            originalCommand: rawInputToProcess,
            ...(customerName && { customerName }),
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
            ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
            ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
        };

        const orderItemsCollectionRef = collection(firestore, "order_items");
        
        if (currentItem?.id) {
            const docRef = doc(orderItemsCollectionRef, currentItem.id);
            await setDocumentNonBlocking(docRef, finalItem);
            toast({
                duration: 4000,
                component: <ToastContent item={{...finalItem, id: docRef.id, timestamp: new Date().toISOString() }} title="Lançamento Atualizado" />,
            });
        } else {
            const docRef = await addDoc(orderItemsCollectionRef, finalItem);
            toast({
                duration: 4000,
                component: <ToastContent item={{...finalItem, id: docRef.id, timestamp: new Date().toISOString() }} title="Lançamento Adicionado" />,
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
    if (!firestore || !itemToDelete) return;
    await deleteDocumentNonBlocking(doc(firestore, "order_items", itemToDelete));
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
    if (!user || !firestore || !todaysItems || todaysItems.length === 0) {
      toast({ variant: 'destructive', title: 'Impossível Salvar', description: 'Não há itens para gerar o relatório.' });
      return;
    }
    setIsSavingReport(true);
  
    try {
      const batch = writeBatch(firestore);
      const reportDate = format(new Date(), 'yyyy-MM-dd');
      
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
        totalPedidos: todaysItems.length,
        totalEntregas: totals.totalEntregas,
        totalItensRua: totals.totalItensRua,
        contagemTotal: totals.contagemTotal,
        contagemRua: totals.contagemRua
      };
      
      const reportRef = doc(collection(firestore, 'daily_reports'));
      batch.set(reportRef, report);

      todaysItems.forEach(item => {
        const itemRef = doc(firestore, 'order_items', item.id);
        batch.delete(itemRef);
      });

      await batch.commit();

      toast({
        title: 'Relatório Salvo!',
        description: 'O relatório do dia foi salvo e os lançamentos foram arquivados.',
      });

    } catch (error) {
      console.error('Error saving report:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Salvar',
        description: 'Não foi possível salvar o relatório.',
      });
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

  const todaysItems = useMemo(() => {
    if (!items) return [];
    return items.filter(item => {
      try {
        const itemDate = parseISO(item.timestamp);
        return isToday(itemDate);
      } catch (e) {
        if ((item.timestamp as any)?.toDate) {
            return isToday((item.timestamp as any).toDate());
        }
        return false;
      }
    });
  }, [items]);
  
  const totals = useMemo(() => {
    if (!todaysItems || todaysItems.length === 0) {
      return {
        totalGeral: 0, totalAVista: 0, totalFiado: 0, totalVendasSalao: 0,
        totalVendasRua: 0, totalFiadoSalao: 0, totalFiadoRua: 0, totalKg: 0, totalTaxas: 0,
        totalBomboniereSalao: 0, totalBomboniereRua: 0, totalItens: 0,
        totalPedidos: 0, totalEntregas: 0, totalItensRua: 0,
        contagemTotal: {} as ItemCount, contagemRua: {} as ItemCount,
      };
    }
  
    const result = todaysItems.reduce((acc, item) => {
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
  }, [todaysItems]);

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
      
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O item será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
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
                onEdit={handleEditRequest}
                onDelete={handleDeleteRequest}
                onFavorite={handleFavoriteSave}
                savedFavorites={savedFavorites}
                isLoading={isLoadingItems || isLoadingBomboniere}
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
                <span className="font-bold text-green-500">{formatCurrency(totals.totalAVista)}</span>
             </div>
             <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Fiado:</span>
                <span className="font-bold text-destructive">{formatCurrency(totals.totalFiado)}</span>
             </div>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-r border-border/50 h-full">
            <span className="text-muted-foreground">Entregas</span>
            <span className="font-bold text-foreground">{totals.totalEntregas} ({formatCurrency(totals.totalTaxas)})</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-primary/10 p-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary/80">Total</span>
            <span className="text-base font-bold text-primary">{formatCurrency(totals.totalGeral)}</span>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function Home() {
  const { user, isUserLoading } = useUser();

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center text-center p-4">
        <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary mb-4" />
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">A aguardar autenticação...</p>
      </div>
    );
  }

  if (!user) {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center text-center p-4">
            <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary mb-4" />
            <p className="mt-4 text-muted-foreground">Falha na autenticação. Por favor, tente novamente.</p>
            <p className="mt-2 text-xs text-destructive">Se esta mensagem persistir, verifique a sua conexão ou as configurações do Firebase.</p>
        </div>
    );
  }

  return <LancheTrackerPage user={user} />;
}

    