
"use client";

import { useMemo, useState, useRef } from "react";
import type { Item, Group, PredefinedItem, SelectedBomboniereItem, BomboniereItem } from "@/types";
import { PREDEFINED_PRICES, DELIVERY_FEE } from "@/lib/constants";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";


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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, Plus } from "lucide-react";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import ItemList from "@/components/item-list";
import SummaryReport from "@/components/summary-report";
import FinalReport from "@/components/final-report";
import BomboniereModal from "@/components/bomboniere-modal";
import usePersistentState from "@/hooks/use-persistent-state";
import { BOMBONIERE_ITEMS_DEFAULT } from "@/lib/constants";

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
  const { data: items, isLoading, error: firestoreError } = useCollection<Item>(orderItemsRef);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editInputValue, setEditInputValue] = useState("");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isBomboniereModalOpen, setBomboniereModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [bomboniereItems, setBomboniereItems] = usePersistentState<BomboniereItem[]>('bomboniereItems', BOMBONIERE_ITEMS_DEFAULT);

  const { toast } = useToast();

  const handleUpsertItem = async (rawInputToProcess: string, currentItem?: Item | null) => {
    setIsProcessing(true);
    try {
        let mainInput = rawInputToProcess.trim();
        if (!mainInput) return;

        let group: Group = 'Vendas salão';
        let deliveryFeeApplicable = false;
        let isTaxExempt = false;
        
        const partsWithExemption = mainInput.split(' ').filter(part => part.trim() !== '');
        if (partsWithExemption.map(p => p.toUpperCase()).includes('E')) {
          isTaxExempt = true;
          mainInput = partsWithExemption.filter(p => p.toUpperCase() !== 'E').join(' ');
        }

        const upperCaseProcessedInput = mainInput.toUpperCase();

        if (upperCaseProcessedInput.startsWith("R ")) {
            group = 'Vendas rua';
            deliveryFeeApplicable = true;
            mainInput = mainInput.substring(2).trim();
        } else if (upperCaseProcessedInput.startsWith("FR ")) {
            group = 'Fiados rua';
            deliveryFeeApplicable = true;
            mainInput = mainInput.substring(3).trim();
        } else if (upperCaseProcessedInput.startsWith("F ")) {
            group = 'Fiados salão';
            mainInput = mainInput.substring(2).trim();
        }

        const parts = mainInput.split(' ').filter(part => part.trim() !== '');
        
        let totalQuantity = 0;
        let totalPrice = 0;
        let individualPrices: number[] = [];
        let predefinedItems: PredefinedItem[] = [];
        let processedBomboniereItems: SelectedBomboniereItem[] = [];
        let customDeliveryFee: number | null = null;
        
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
            
            const quantityMatch = part.match(/^(\d+)([A-Z\d-]+)$/i);
            let baseQuantity = 1;
            let currentItemCode = upperPart;

            if (quantityMatch) {
                baseQuantity = parseInt(quantityMatch[1], 10);
                currentItemCode = quantityMatch[2].toUpperCase();
            }

            const isPredefined = PREDEFINED_PRICES[currentItemCode];
            
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
            } else { // Potentially bomboniere item
                try {
                    const potentialPricePart = (i + 1 < parts.length && isNumeric(parts[i+1])) ? parts[i+1] : '';
                    const { itemName, customPrice } = await parseCustomItemPrice({ itemName: `${part} ${potentialPricePart}`.trim() });
                    
                    const bomboniereMatch = itemName.match(/^(\d*)([A-Z\d-]+)$/i);

                    if (bomboniereMatch) {
                        const qty = bomboniereMatch[1] ? parseInt(bomboniereMatch[1], 10) : 1;
                        const name = bomboniereMatch[2];
                        const bomboniereItemDef = bomboniereItems.find(bi => bi.name.toUpperCase().replace(/\s+/g, '-') === name.toUpperCase());

                        if (customPrice !== undefined) {
                            processedBomboniereItems.push({ id: bomboniereItemDef?.id || name, name, quantity: qty, price: customPrice });
                            totalPrice += customPrice * qty;
                            if (potentialPricePart) i++; // consume price part
                            totalQuantity += qty;
                        } else if (i + 1 < parts.length && isNumeric(parts[i+1])) {
                            // Fallback for simple cases not caught by AI (e.g. no space)
                            const price = parseFloat(parts[i+1].replace(',', '.'));
                            processedBomboniereItems.push({ id: bomboniereItemDef?.id || name, name, quantity: qty, price });
                            totalPrice += price * qty;
                            i++; // consume price part
                            totalQuantity += qty;
                        } else {
                            // This part is not a valid bomboniere item with price, may be part of a name
                        }
                    }
                } catch(e) {
                    console.error("AI parsing failed, skipping part:", part, e);
                }
            }
        }
        
        if (predefinedItems.length === 0 && individualPrices.length === 0 && processedBomboniereItems.length === 0) {
            toast({ variant: "destructive", title: "Entrada inválida", description: "Nenhum item válido foi encontrado."});
            setIsProcessing(false);
            return;
        };

        // Decrement stock for bomboniere items
        if (!currentItem) { // Only decrement stock for new items, not for edits
          setBomboniereItems(prevBomboniereItems => {
              const newBomboniereItems = [...prevBomboniereItems];
              processedBomboniereItems.forEach(soldItem => {
                  const itemIndex = newBomboniereItems.findIndex(i => i.id === soldItem.id);
                  if (itemIndex !== -1) {
                      newBomboniereItems[itemIndex].stock -= soldItem.quantity;
                  }
              });
              return newBomboniereItems;
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
        if (hasBomboniereItems) nameParts.push('Bomboniere');
        
        consolidatedName = nameParts.join(' + ') || 'Lançamento';
        if (consolidatedName.length > 50) consolidatedName = 'Lançamento Misto';


        const finalItem: Omit<Item, 'id' | 'total',> = {
            name: consolidatedName,
            quantity: totalQuantity,
            price: totalPrice,
            group,
            timestamp: new Date().toISOString(),
            deliveryFee,
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
            ...(predefinedItems.length > 0 ? { predefinedItems } : {}),
            ...(processedBomboniereItems.length > 0 ? { bomboniereItems: processedBomboniereItems } : {}),
        };


        if (currentItem?.id) {
            // Note: Editing an item does not currently adjust stock. This might be a desired future feature.
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
        if (editingItem) setEditingItem(null);
    }
  };


  const handleClearData = async () => {
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

    if(item.bomboniereItems && item.bomboniereItems.length > 0) {
        item.bomboniereItems.forEach(bi => {
            reconstructedParts.push(`${bi.quantity}${bi.name.toLowerCase()} ${String(bi.price).replace('.', ',')}`);
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
      // Stock is not adjusted on edit, only on new entry.
      handleUpsertItem(editInputValue, editingItem)
    }
  }


  const handleDeleteRequest = (id: string) => {
    setItemToDelete(id);
  };
  
  const confirmDelete = () => {
    if(!firestore || !itemToDelete) return;
    // Note: Deleting an item does not currently return stock. This might be a desired future feature.
    deleteDocumentNonBlocking(doc(firestore, "order_items", itemToDelete));
    toast({
      title: "Sucesso",
      description: "Item removido.",
    });
    setItemToDelete(null);
  };

  const handleBomboniereAdd = (itemsToAdd: SelectedBomboniereItem[]) => {
      const itemsString = itemsToAdd.map(item => `${item.quantity}${item.name.replace(/\s+/g, '-').toLowerCase()} ${String(item.price).replace('.', ',')}`).join(' ');
      setRawInput(prev => `${prev} ${itemsString}`.trim());
      setBomboniereModalOpen(false);
      inputRef.current?.focus();
  }

  const handleItemFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawInput.trim()) return;
    handleUpsertItem(rawInput);
    inputRef.current?.focus();
  };


  const displayItems = items || [];
  
  const summary = useMemo(() => {
    if (!items) return { total: 0, deliveryCount: 0, totalDeliveryFee: 0 };
    
    const total = items.reduce((acc, item) => acc + item.total, 0);
    const deliveryItems = items.filter(item => item.deliveryFee > 0);
    
    let deliveryCount = deliveryItems.length;
    
    const totalDeliveryFee = deliveryItems.reduce((acc, item) => acc + (item.deliveryFee || 0), 0);

    return { total, deliveryCount, totalDeliveryFee };
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
              placeholder="Ex: F m p"
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
        bomboniereItems={bomboniereItems}
        setBomboniereItems={setBomboniereItems}
      />


      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-28">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-headline font-bold text-primary sm:text-5xl">
            Restaurante da Mirinha
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">Controle de Pedidos</p>
        </header>

        <main className="space-y-6">
          <ItemForm
            rawInput={rawInput}
            setRawInput={setRawInput}
            onItemSubmit={handleItemFormSubmit}
            onOpenBomboniere={() => setBomboniereModalOpen(true)}
            isProcessing={isProcessing}
            inputRef={inputRef}
          />

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
                    <FinalReport items={displayItems} />
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
          
          <div className="flex justify-center">
            <Button variant="destructive" onClick={handleClearData} disabled={!items || items.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              Limpar Todos os Dados
            </Button>
          </div>
        </main>
      </div>
      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto max-w-4xl flex justify-between items-center p-3 text-xs sm:text-sm">
          <div className="flex flex-col sm:flex-row sm:gap-4">
             <div className="text-muted-foreground">Entregas: <span className="font-bold text-foreground">{summary.deliveryCount} ({formatCurrency(summary.totalDeliveryFee)})</span></div>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground">Faturamento Total:</span>
            <p className="text-lg sm:text-xl font-bold text-primary">{formatCurrency(summary.total)}</p>
          </div>
        </div>
      </footer>
    </>
  );
}

    

    