"use client";

import { useState } from "react";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";
import type { Item, Group } from "@/types";
import { PREDEFINED_PRICES } from "@/lib/constants";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";

import ItemForm from "@/components/item-form";
import ItemList from "@/components/item-list";
import SummaryReport from "@/components/summary-report";
import FinalReport from "@/components/final-report";

const DELIVERY_FEE = 6.00;

export default function Home() {
  const firestore = useFirestore();
  const orderItemsRef = useMemoFirebase(() => collection(firestore, "order_items"), [firestore]);
  const { data: items, isLoading } = useCollection<Item>(orderItemsRef);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleUpsertItem = async (rawInput: string) => {
    setIsProcessing(true);
    try {
        let input = rawInput.trim();

        // 1. Extract quantity (e.g., "2x", "2 ")
        let quantity = 1;
        const quantityMatch = input.match(/^(\d+)\s*x?\s*(.*)/i);
        if (quantityMatch) {
            quantity = parseInt(quantityMatch[1], 10);
            input = quantityMatch[2].trim();
        }

        // 2. Determine group and clean item code based on prefixes
        let group: Group = 'Vendas salão';
        let deliveryFee = 0;
        const upperCaseInput = input.toUpperCase();

        if (upperCaseInput.startsWith("FR ")) {
            group = 'Fiados rua';
            deliveryFee = DELIVERY_FEE;
            input = input.substring(3).trim();
        } else if (upperCaseInput.startsWith("R ")) {
            group = 'Vendas rua';
            deliveryFee = DELIVERY_FEE;
            input = input.substring(2).trim();
        } else if (upperCaseInput.startsWith("F ")) {
            group = 'Fiados salão';
            input = input.substring(2).trim();
        }
        
        let price = 0;
        let finalName = "";
        
        // 3. Check for predefined price keys
        const predefinedKey = input.replace(/\s+/g, '').toUpperCase();
        if (PREDEFINED_PRICES[predefinedKey]) {
            price = PREDEFINED_PRICES[predefinedKey];
            finalName = predefinedKey;
        } else {
            // 4. If not predefined, use AI to parse custom price and name
            const aiResult = await parseCustomItemPrice({
                itemName: input.replace(",", "."),
            });

            if (aiResult.customPrice !== undefined && aiResult.customPrice !== null) {
                price = aiResult.customPrice;
                finalName = aiResult.itemName;
            } else {
                finalName = input; // If AI finds no price, the whole string is the name
            }
        }
        
        if (!finalName) {
            toast({
                variant: "destructive",
                title: "Erro",
                description: "O nome do item não pode ser vazio.",
            });
            setIsProcessing(false);
            return;
        }

        const total = (price + deliveryFee) * quantity;

        // 5. Upsert item
        const itemData = {
            name: finalName,
            quantity,
            price: price + deliveryFee,
            total,
            group,
        };

        if (editingItemId) {
            const docRef = doc(firestore, "order_items", editingItemId);
            setDocumentNonBlocking(docRef, itemData, { merge: true });
            toast({ title: "Sucesso", description: "Item atualizado." });
            setEditingItemId(null);
        } else {
            const newItem = { ...itemData, timestamp: new Date().toISOString() };
            addDocumentNonBlocking(orderItemsRef, newItem);
        }

    } catch (error) {
        console.error("Error upserting item:", error);
        toast({
            variant: "destructive",
            title: "Erro ao processar item",
            description: "Ocorreu um problema ao processar o item.",
        });
    } finally {
        setIsProcessing(false);
    }
  };


  const handleClearData = async () => {
    if (!items) return;
    try {
      const promises = items.map(item => deleteDoc(doc(firestore, "order_items", item.id)));
      await Promise.all(promises);
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

  const handleEditItem = (id: string) => {
    setEditingItemId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  
  const handleDeleteItem = (id: string) => {
    deleteDocumentNonBlocking(doc(firestore, "order_items", id));
    toast({
      title: "Sucesso",
      description: "Item removido.",
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
  };

  const itemToEdit = items?.find(item => item.id === editingItemId) || null;
  const displayItems = items || [];

  return (
    <div className="container mx-auto max-w-4xl p-2 sm:p-4 lg:p-8">
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
          editingItem={itemToEdit}
          onCancelEdit={handleCancelEdit}
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
                  <ItemList items={displayItems} onEdit={handleEditItem} onDelete={handleDeleteItem} isLoading={isLoading} />
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
          <Button variant="destructive" onClick={handleClearData}>
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar Todos os Dados
          </Button>
        </div>
      </main>
    </div>
  );
}
