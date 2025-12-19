"use client";

import { useState } from "react";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";
import type { Item, Group } from "@/types";
import { PREDEFINED_PRICES } from "@/lib/constants";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, deleteDoc, setDoc } from "firebase/firestore";

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
      let group: Group = "Vendas salão";
      let quantity = 1;
      let nameForProcessing = rawInput.trim();

      // 1. Extract quantity from the start of the string
      const quantityMatch = nameForProcessing.match(/^(\d+)\s*(.*)/);
      if (quantityMatch) {
        quantity = parseInt(quantityMatch[1], 10);
        nameForProcessing = quantityMatch[2].trim();
      }

      // 2. Determine group and clean name
      const upperCaseName = nameForProcessing.toUpperCase();
      let nameWithoutGroupPrefix = nameForProcessing;

      if (upperCaseName.startsWith("FR ")) {
        group = "Fiados rua";
        nameWithoutGroupPrefix = nameForProcessing.substring(3).trim();
      } else if (upperCaseName.startsWith("F ")) {
        group = "Fiados salão";
        nameWithoutGroupPrefix = nameForProcessing.substring(2).trim();
      } else if (upperCaseName.startsWith("R ")) {
        group = "Vendas rua";
        nameWithoutGroupPrefix = nameForProcessing.substring(2).trim();
      } else if (upperCaseName.startsWith("M ")) {
        // This could be a price or a group prefix. Let's see.
        const potentialPriceMatch = nameForProcessing.match(/^M\s+([0-9,.]+)/);
        if(!potentialPriceMatch) {
            // If it's not `M <number>`, we assume it's Vendas Salão (M de Mesa)
             group = "Vendas salão";
             nameWithoutGroupPrefix = nameForProcessing.substring(2).trim();
        }
      }
      
      const itemLookupKey = nameWithoutGroupPrefix.toUpperCase();
      let price = 0;
      let finalName = nameWithoutGroupPrefix;

      // 3. Find price
      if (PREDEFINED_PRICES[itemLookupKey]) {
          price = PREDEFINED_PRICES[itemLookupKey];
          finalName = itemLookupKey;
      } else {
        // 4. If not a predefined price, use AI for custom prices
        const aiResult = await parseCustomItemPrice({
          itemName: nameWithoutGroupPrefix.replace(",", "."),
        });

        if (aiResult.customPrice !== undefined && aiResult.customPrice !== null) {
          price = aiResult.customPrice;
          finalName = aiResult.itemName;
        } else {
          finalName = nameWithoutGroupPrefix;
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

      // 5. Upsert item
      if (editingItemId) {
        const docRef = doc(firestore, "order_items", editingItemId);
        const updatedItem: Partial<Item> = {
          name: finalName,
          quantity,
          price,
          total: price * quantity,
          group,
        };
        setDocumentNonBlocking(docRef, updatedItem, { merge: true });
        toast({ title: "Sucesso", description: "Item atualizado." });
        setEditingItemId(null);
      } else {
        const id = crypto.randomUUID();
        const docRef = doc(firestore, "order_items", id);
        const newItem: Item = {
          id,
          name: finalName,
          quantity,
          price,
          total: price * quantity,
          group,
          timestamp: new Date().toISOString(),
        };
        addDocumentNonBlocking(docRef, newItem);
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
      // Not a non-blocking update.
      await Promise.all(items.map(item => deleteDoc(doc(firestore, "order_items", item.id))));
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
