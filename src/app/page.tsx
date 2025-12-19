
"use client";

import { useMemo, useState } from "react";
import type { Item, Group } from "@/types";
import { PREDEFINED_PRICES } from "@/lib/constants";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc } from "firebase/firestore";

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
import { Trash2, Save } from "lucide-react";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import ItemList from "@/components/item-list";
import SummaryReport from "@/components/summary-report";
import FinalReport from "@/components/final-report";

const DELIVERY_FEE = 6.00;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};


export default function Home() {
  const firestore = useFirestore();
  const orderItemsRef = useMemoFirebase(() => collection(firestore, "order_items"), [firestore]);
  const { data: items, isLoading, error: firestoreError } = useCollection<Item>(orderItemsRef);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editInputValue, setEditInputValue] = useState("");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const handleUpsertItem = async (rawInput: string, currentItem?: Item | null) => {
    setIsProcessing(true);
    try {
        let mainInput = rawInput.trim();
        if (!mainInput) return;

        let group: Group = 'Vendas salão';
        let deliveryFeeApplicable = false;
        const upperCaseInput = mainInput.toUpperCase();

        if (upperCaseInput.startsWith("R ")) {
            group = 'Vendas rua';
            deliveryFeeApplicable = true;
            mainInput = mainInput.substring(2).trim();
        } else if (upperCaseInput.startsWith("FR ")) {
            group = 'Fiados rua';
            deliveryFeeApplicable = true;
            mainInput = mainInput.substring(3).trim();
        } else if (upperCaseInput.startsWith("F ")) {
            group = 'Fiados salão';
            mainInput = mainInput.substring(2).trim();
        }

        const parts = mainInput.split(' ').filter(part => part.trim() !== '');
        
        let totalQuantity = 0;
        let totalPrice = 0;
        let individualPrices: number[] = [];
        let itemNames: string[] = [];
        let baseQuantity = 1;

        const quantityMatch = parts[0].match(/^(\d+)x$/i);
        if (quantityMatch) {
            baseQuantity = parseInt(quantityMatch[1], 10);
            parts.shift(); // Remove the quantity part
        }

        let i = 0;
        while (i < parts.length) {
            const part = parts[i].toUpperCase();
            const nextPart = i + 1 < parts.length ? parts[i + 1] : null;
            const isNumeric = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);

            if (PREDEFINED_PRICES[part]) { // Predefined item
                let itemPrice = PREDEFINED_PRICES[part];
                if (nextPart && isNumeric(nextPart)) {
                    itemPrice = parseFloat(nextPart.replace(',', '.'));
                    i++; // Skip next part as it's a price
                }
                totalQuantity += baseQuantity;
                totalPrice += itemPrice * baseQuantity;
                for(let j=0; j < baseQuantity; j++) {
                    itemNames.push(part);
                }
                baseQuantity = 1; // Reset base quantity
            } else if (isNumeric(part)) { // KG item
                const price = parseFloat(part.replace(',', '.'));
                totalQuantity += 1;
                totalPrice += price;
                individualPrices.push(price);
                itemNames.push('KG');
            }
            i++;
        }
        
        if (totalQuantity === 0) {
            toast({ variant: "destructive", title: "Entrada inválida", description: "Nenhum item válido foi encontrado."});
            return;
        };

        const deliveryFee = deliveryFeeApplicable ? DELIVERY_FEE : 0;
        const total = totalPrice + deliveryFee;
        
        // Determine the name for the consolidated item
        let consolidatedName: string;
        if (itemNames.every(name => name === 'KG')) {
             consolidatedName = 'KG';
        } else if (itemNames.length === 1) {
            consolidatedName = itemNames[0];
        } else {
            consolidatedName = 'Lançamento Misto';
        }
        
        const finalItem: Omit<Item, 'id' | 'total'> = {
            name: consolidatedName,
            quantity: totalQuantity,
            price: totalPrice,
            group,
            timestamp: new Date().toISOString(),
            deliveryFee,
            ...(individualPrices.length > 0 ? { individualPrices } : {}),
        };


        if (currentItem?.id) {
            const docRef = doc(firestore, "order_items", currentItem.id);
            setDocumentNonBlocking(docRef, { ...finalItem, total }, { merge: true });
            toast({ title: "Sucesso", description: "Lançamento atualizado." });
        } else {
            addDocumentNonBlocking(orderItemsRef, { ...finalItem, total });
            toast({ title: "Sucesso", description: "Lançamento adicionado." });
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
    
    // This reconstruction is complex and might not be perfect for mixed types.
    // For now, it reconstructs a simplified version.
    const groupPrefixMap: { [K in Item['group']]?: string } = {
        'Fiados rua': 'Fr ',
        'Fiados salão': 'F ',
        'Vendas rua': 'R ',
        'Vendas salão': '',
    };
    const prefix = groupPrefixMap[item.group] || '';

    let reconstructedInput = '';
    if(item.name === 'KG' && item.individualPrices) {
        reconstructedInput = item.individualPrices.join(' ').replace(/\./g, ',');
    } else {
        reconstructedInput = `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name} ${item.price.toFixed(2).replace('.', ',')}`;
    }

    setEditInputValue(prefix + reconstructedInput);
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

  const displayItems = items || [];
  
  const summary = useMemo(() => {
    if (!items) return { total: 0, deliveryCount: 0, totalDeliveryFee: 0 };
    
    const total = items.reduce((acc, item) => acc + item.total, 0);
    const deliveryItems = items.filter(item => item.deliveryFee > 0);
    
    const deliveryCount = deliveryItems.reduce((acc, item) => {
      // For KG items, delivery is counted once per launch, not per individual price
      if (item.name === 'KG') return acc + 1;
      return acc + item.quantity;
    }, 0);
    
    const totalDeliveryFee = deliveryItems.reduce((acc, item) => acc + item.deliveryFee, 0);

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
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o item.
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
              placeholder="Ex: F 2x p 12,50"
              className="h-10 flex-1 sm:h-12 text-base"
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

      <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8 pb-28">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-headline font-bold text-primary sm:text-5xl">
            Restaurante da Mirinha
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">Controle de Pedidos</p>
        </header>

        <main className="space-y-6">
          <ItemForm
            onItemSubmit={handleUpsertItem}
            isProcessing={isProcessing}
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
