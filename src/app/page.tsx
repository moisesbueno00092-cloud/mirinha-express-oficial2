
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { Item, Group, PredefinedItem, SelectedBomboniereItem, BomboniereItem, FavoriteClient } from "@/types";
import { PREDEFINED_PRICES, DELIVERY_FEE, BOMBONIERE_ITEMS_DEFAULT } from "@/lib/constants";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";
import Link from 'next/link';


import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, History, Star, UserPlus, Pencil, X } from "lucide-react";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import ItemList from "@/components/item-list";
import SummaryReport from "@/components/summary-report";
import FinalReport from "@/components/final-report";
import BomboniereModal from "@/components/bomboniere-modal";
import MirinhaLogo from "@/components/mirinha-logo";
import FavoritesMenu from "@/components/favorites-menu";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const isNumeric = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);

export default function Home() {
  const firestore = useFirestore();
  const orderItemsRef = useMemoFirebase(() => collection(firestore, "order_items"), [firestore]);
  const clientAccountsRef = useMemoFirebase(() => collection(firestore, "client_accounts"), [firestore]);
  const bomboniereItemsRef = useMemoFirebase(() => collection(firestore, "bomboniere_items"), [firestore]);
  const favoriteClientsRef = useMemoFirebase(() => collection(firestore, "favorite_clients"), [firestore]);

  const { data: items, isLoading, error: firestoreError } = useCollection<Item>(orderItemsRef);
  const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsRef);
  const { data: favoriteClients, isLoading: isLoadingFavorites } = useCollection<FavoriteClient>(favoriteClientsRef);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editInputValue, setEditInputValue] = useState("");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [clearAllDataRequest, setClearAllDataRequest] = useState(false);
  const [isBomboniereModalOpen, setBomboniereModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // State for Favorites Modal
  const [isFavoritesModalOpen, setFavoritesModalOpen] = useState(false);
  const [favoriteClientToDelete, setFavoriteClientToDelete] = useState<string | null>(null);
  const [favoriteFormData, setFavoriteFormData] = useState({ name: '', command: '' });

  const { toast } = useToast();
  
  useEffect(() => {
    // Seed bomboniere items if the collection is empty
    if (firestore && !isLoadingBomboniere && bomboniereItems && bomboniereItems.length === 0) {
      BOMBONIERE_ITEMS_DEFAULT.forEach(item => {
        const { id, ...itemData } = item;
        const docRef = doc(firestore, 'bomboniere_items', id);
        setDocumentNonBlocking(docRef, itemData, { merge: true });
      });
    }
  }, [firestore, bomboniereItems, isLoadingBomboniere]);

  const handleUpsertItem = async (rawInputToProcess: string, currentItem?: Item | null, favoriteClient?: FavoriteClient) => {
    setIsProcessing(true);
    try {
        let mainInput = rawInputToProcess.trim();
        if (!mainInput) return;

        let group: Group = 'Vendas salão';
        if (favoriteClient) {
            group = 'Fiados salão'; // default for favorites
        }

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
                i--; // Decrement because the outer loop will increment
                totalQuantity += individualPrices.length;
                continue;
            }

            if (upperPart === 'TX') {
                if (i + 1 < parts.length && isNumeric(parts[i+1])) {
                    customDeliveryFee = parseFloat(parts[i+1].replace(',', '.'));
                    i++; // Consume the fee value
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

                // Check for a custom price immediately following the item code
                if (i + 1 < parts.length && isNumeric(parts[i + 1])) {
                    priceToUse = parseFloat(parts[i + 1].replace(',', '.'));
                    i++; // Consume the price part
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
                    i++; // Consume the price part
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
                i++; // consume price part
            } else if (part.match(/^\d+[a-zA-Z]+/) && i + 1 < parts.length && isNumeric(parts[i+1])) {
                // Fallback to AI for complex cases like '2bala 0.50'
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
                        i++; // consume price part
                    }
                } catch(e) {
                    console.error("AI parsing failed, skipping part:", part, e);
                }
            } else if (!isNumeric(part) && /^[a-zA-Z\s]+$/.test(part) && (group.startsWith('Fiado')) && !favoriteClient) {
                // Assume it's a customer name for fiado if not a favorite client launch
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

        if (!currentItem && bomboniereItems && firestore) { // Only decrement stock for new items, not for edits
          processedBomboniereItems.forEach(soldItem => {
              const itemDef = bomboniereItems.find(i => i.id === soldItem.id);
              if (itemDef) {
                  const newStock = itemDef.stock - soldItem.quantity;
                  const docRef = doc(firestore, "bomboniere_items", itemDef.id);
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


        const finalItem: Omit<Item, 'id' | 'total'> = {
            name: consolidatedName,
            quantity: totalQuantity,
            price: totalPrice,
            group,
            timestamp: new Date().toISOString(),
            deliveryFee,
            ...(customerName && { customerName }),
            ...(favoriteClient && { favoriteClientId: favoriteClient.id }),
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
            ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
            ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
        };


        if (currentItem?.id) {
            const docRef = doc(firestore, "order_items", currentItem.id);
            setDocumentNonBlocking(docRef, { ...finalItem, total }, { merge: true });
            toast({ title: "Sucesso", description: "Lançamento atualizado." });
        } else {
            addDocumentNonBlocking(orderItemsRef, { ...finalItem, total });
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

  const handleFavoriteLaunch = (client: FavoriteClient) => {
    if (!firestore) return;
    handleUpsertItem(client.command, null, client);
    toast({
      title: "Lançamento Rápido",
      description: `Comando para ${client.name} executado.`,
    });
  };


  const confirmClearData = () => {
    if (!items || !firestore) return;
    try {
      items.forEach(item => {
        const docRef = doc(firestore, "order_items", item.id);
        deleteDocumentNonBlocking(docRef);
      });
      toast({
        title: "Sucesso",
        description: "Todos os dados foram apagados.",
      });
    } catch (error) {
      console.error("Error clearing data:", error);
      toast({
        variant: "destructive",
        title: "Erro ao limpar dados",
        description: "Ocorreu um problema ao apagar os itens.",
      });
    }
    setClearAllDataRequest(false);
  };

  const handleEditRequest = (item: Item) => {
    setEditingItem(item);
    
    const groupPrefixMap: { [K in Item['group']]?: string } = {
        'Fiados rua': 'Fr ',
        'Fiados salão': 'F ',
        'Vendas rua': 'R ',
        'Vendas salão': '',
    };
    const prefix = groupPrefixMap[item.group] || '';

    let reconstructedParts: string[] = [];
    
    if (item.customerName && !item.favoriteClientId) {
      reconstructedParts.push(item.customerName);
    }

    if (item.predefinedItems && item.predefinedItems.length > 0) {
      const itemGroups: Record<string, {count: number, price: number}> = {};
      
      item.predefinedItems.forEach(pi => {
        const key = `${pi.name}-${pi.price}`;
        if (!itemGroups[key]) {
          itemGroups[key] = { count: 0, price: pi.price };
        }
        itemGroups[key].count++;
      });
      
      Object.entries(itemGroups).forEach(([key, {count, price}]) => {
          const name = key.split('-')[0];
          const defaultPrice = PREDEFINED_PRICES[name.toUpperCase()];
          let part = count > 1 ? `${count}${name.toLowerCase()}` : name.toLowerCase();
          if (price !== defaultPrice) {
            part += ` ${String(price).replace('.', ',')}`;
          }
          reconstructedParts.push(part);
      });
    }
    
    if (item.individualPrices && item.individualPrices.length > 0) {
      reconstructedParts.push(`kg ${item.individualPrices.map(p => String(p).replace('.', ',')).join(' ')}`);
    }

    if(item.bomboniereItems && item.bomboniereItems.length > 0 && bomboniereItems) {
        item.bomboniereItems.forEach(bi => {
            const qtyPart = bi.quantity > 1 ? `${bi.quantity}` : '';
            const bomboniereDef = bomboniereItems.find(item => item.id === bi.id);
            const namePart = bomboniereDef ? bomboniereDef.name.toLowerCase().replace(/\s+/g, '-') : bi.name.toLowerCase();

            // Check if the price is the default bomboniere price. If not, append it.
            let part = `${qtyPart}${namePart}`;
            if (bomboniereDef && bi.price !== bomboniereDef.price) {
                part += ` ${String(bi.price).replace('.', ',')}`;
            } else if (!bomboniereDef) { // If it's a custom item, always add price
                 part += ` ${String(bi.price).replace('.', ',')}`;
            }
            reconstructedParts.push(part);
        });
    }

    if (item.deliveryFee > 0 && item.deliveryFee !== DELIVERY_FEE) {
        reconstructedParts.push(`tx ${String(item.deliveryFee).replace('.', ',')}`);
    } else if (item.deliveryFee === 0 && (item.group === 'Vendas rua' || item.group === 'Fiados rua')) {
        reconstructedParts.push('e');
    }

    if (reconstructedParts.length === 0 && item.name) {
       reconstructedParts.push(item.name);
    }

    setEditInputValue(prefix + reconstructedParts.join(' '));
  };

  const handleSaveEdit = () => {
    if(editingItem && editInputValue) {
      handleUpsertItem(editInputValue, editingItem)
    }
  }


  const handleDeleteRequest = (id: string) => {
    setItemToDelete(id);
  };
  
  const confirmDelete = () => {
    if(!firestore || !itemToDelete) return;
    deleteDocumentNonBlocking(doc(firestore, "order_items", itemToDelete));
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
  
  // --- Favorites Modal Logic ---
  const sortedFavoriteClients = useMemo(() => 
    [...(favoriteClients || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [favoriteClients]
  );
  
  const isFavoriteFormValid = favoriteFormData.name.trim() && favoriteFormData.command.trim();

  const handleSaveFavorite = () => {
    if (!firestore || !isFavoriteFormValid) return;

    addDocumentNonBlocking(favoriteClientsRef, favoriteFormData);
    
    // Reset form after saving
    setFavoriteFormData({ name: '', command: '' });
  };

  const confirmDeleteFavorite = () => {
    if (favoriteClientToDelete && firestore) {
      const docRef = doc(firestore, 'favorite_clients', favoriteClientToDelete);
      deleteDocumentNonBlocking(docRef);
      setFavoriteClientToDelete(null);
    }
  };
  
  const handleOpenFavoritesModal = () => {
    setFavoriteFormData({ name: '', command: '' });
    setFavoritesModalOpen(true);
  };

  const handleCloseFavoritesModal = () => {
    setFavoritesModalOpen(false);
  };
  // --- End Favorites Modal Logic ---


  const displayItems = items || [];
  
  const summary = useMemo(() => {
    if (!items) {
      return { total: 0, totalAVista: 0, totalFiado: 0, deliveryCount: 0, totalDeliveryFee: 0 };
    }

    let total = 0;
    let totalAVista = 0;
    let totalFiado = 0;
    let deliveryCount = 0;
    let totalDeliveryFee = 0;

    items.forEach(item => {
      total += item.total;
      if (item.group.includes('Fiados')) {
        totalFiado += item.total;
      } else {
        totalAVista += item.total;
      }
      if (item.deliveryFee > 0) {
        deliveryCount++;
        totalDeliveryFee += item.deliveryFee;
      }
    });

    return { total, totalAVista, totalFiado, deliveryCount, totalDeliveryFee };
  }, [items]);

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

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={editInputValue}
              onChange={(e) => setEditInputValue(e.target.value)}
              placeholder=""
              className="h-10 flex-1 sm:h-12 text-base"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveEdit();
                }
              }}
              disabled={!!editingItem?.favoriteClientId}
            />
             {editingItem?.favoriteClientId && (
                <p className="text-xs text-muted-foreground mt-2">
                    Lançamentos de clientes favoritos não podem ser editados diretamente. Você pode excluir este lançamento e fazê-lo novamente.
                </p>
             )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
                <Button type="button" variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button type="submit" onClick={handleSaveEdit} disabled={isProcessing || !!editingItem?.favoriteClientId}>
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
      
      {/* Manage Favorites Modal */}
      <Dialog open={isFavoritesModalOpen} onOpenChange={setFavoritesModalOpen}>
        <DialogContent className="sm:max-w-md flex flex-col">
            <AlertDialog open={!!favoriteClientToDelete} onOpenChange={(open) => !open && setFavoriteClientToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Essa ação não pode ser desfeita. Isso excluirá permanentemente o cliente dos seus favoritos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteFavorite}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <DialogHeader>
                <DialogTitle>Gerenciar Clientes Favoritos</DialogTitle>
            </DialogHeader>
            <div className="flex-grow overflow-hidden">
                <ScrollArea className="h-64">
                    <div className="space-y-3 pr-6">
                        {sortedFavoriteClients.map((client) => (
                            <Card key={client.id}>
                                <CardContent className="p-3 flex items-center">
                                    <div className="flex-grow">
                                        <p className="font-semibold">{client.name}</p>
                                        <p className="text-sm text-muted-foreground font-mono">{client.command}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setFavoriteClientToDelete(client.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                        {sortedFavoriteClients.length === 0 && (
                            <div className="text-center text-muted-foreground py-10">
                                <p>Nenhum cliente favorito adicionado.</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
            <div className="flex-shrink-0 pt-4 border-t">
                <div className="p-1 bg-muted/50 rounded-lg space-y-3">
                    <h3 className="font-semibold text-center text-sm">Adicionar Novo Cliente</h3>
                    <div className="space-y-1">
                        <Label htmlFor="fav-form-name" className="text-xs">Nome</Label>
                        <Input id="fav-form-name" placeholder="Ex: João da Silva" value={favoriteFormData.name} onChange={(e) => setFavoriteFormData(prev => ({ ...prev, name: e.target.value }))} className="h-8" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="fav-form-command" className="text-xs">Comando</Label>
                        <Input id="fav-form-command" placeholder="Ex: pf coquinha-200ml" value={favoriteFormData.command} onChange={(e) => setFavoriteFormData(prev => ({ ...prev, command: e.target.value }))} className="h-8" />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" size="sm" onClick={handleSaveFavorite} disabled={!isFavoriteFormValid}>
                            <Save className="h-4 w-4 mr-2" /> Salvar Novo Cliente
                        </Button>
                    </div>
                </div>
            </div>
            <DialogFooter className="mt-2">
                <DialogClose asChild>
                    <Button className="w-full" variant="outline">Fechar</Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-48">
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
                onSelectClient={handleFavoriteLaunch}
                onManageFavorites={handleOpenFavoritesModal}
            />
          </ItemForm>

          <Card>
            <CardContent className="p-0">
              <Tabs defaultValue="pedidos" className="w-full">
                <TabsList className="rounded-t-lg rounded-b-none w-full justify-start border-b">
                  <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="relatorio">Relatório Final</TabsTrigger>
                </TabsList>
                <div className="p-2 sm:p-6">
                  <TabsContent value="pedidos">
                    <ItemList
                      items={displayItems}
                      onEdit={handleEditRequest}
                      onDelete={handleDeleteRequest}
                      isLoading={isLoading}
                    />
                  </TabsContent>
                  <TabsContent value="resumo">
                    <SummaryReport items={displayItems} />
                  </TabsContent>
                  <TabsContent value="relatorio">
                    <FinalReport items={displayItems} onClearData={() => setClearAllDataRequest(true)} />
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </main>
      </div>
      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto max-w-4xl grid grid-cols-2 sm:grid-cols-3 items-center p-3 text-xs sm:text-sm gap-2">
            <div className="flex flex-col gap-1">
                <div><span className="text-muted-foreground">À Vista:</span> <span className="font-bold text-foreground">{formatCurrency(summary.totalAVista)}</span></div>
                <div><span className="text-muted-foreground">Fiado:</span> <span className="font-bold text-destructive">{formatCurrency(summary.totalFiado)}</span></div>
            </div>
            <div className="flex flex-col gap-1 text-center">
                <div className="text-muted-foreground">
                    Entregas: <span className="font-bold text-foreground">{summary.deliveryCount}</span>
                </div>
                <div className="text-destructive font-bold">({formatCurrency(summary.totalDeliveryFee)})</div>
            </div>
            <div className="text-right col-span-2 sm:col-span-1">
                <span className="text-muted-foreground">Faturamento Total:</span>
                <p className="text-lg sm:text-xl font-bold text-primary">{formatCurrency(summary.total)}</p>
            </div>
        </div>
      </footer>
    </>
  );
}
