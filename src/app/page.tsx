"use client";

import { useState } from "react";
import { parseCustomItemPrice } from "@/ai/flows/parse-custom-item-price";
import usePersistentState from "@/hooks/use-persistent-state";
import type { Item, Group } from "@/types";
import { PREDEFINED_PRICES } from "@/lib/constants";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

import ItemForm from "@/components/item-form";
import ItemList from "@/components/item-list";
import SummaryReport from "@/components/summary-report";
import FinalReport from "@/components/final-report";

export default function Home() {
  const [items, setItems] = usePersistentState<Item[]>("mirinhas-tracker-items", []);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleAddItem = async (rawItemName: string, quantity: number) => {
    setIsProcessing(true);
    try {
      let nameForProcessing = rawItemName.trim();
      let price = 0;
      let finalName = nameForProcessing;
      let group: Group = "Vendas salão";

      const upperCaseName = nameForProcessing.toUpperCase();

      // 1. Check for group prefixes and strip them
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
      }

      const itemLookupKey = nameWithoutGroupPrefix.toUpperCase();

      // 2. Check for predefined prices first
      if (PREDEFINED_PRICES[itemLookupKey]) {
        price = PREDEFINED_PRICES[itemLookupKey];
        finalName = itemLookupKey;
      } else {
        // 3. If not predefined, try parsing with AI for custom prices like "M 12.50 Item"
        const aiResult = await parseCustomItemPrice({
          itemName: nameWithoutGroupPrefix.replace(",", "."),
        });

        if (aiResult.customPrice !== undefined && aiResult.customPrice !== null) {
          price = aiResult.customPrice;
          finalName = aiResult.itemName;
        } else {
          // 4. If AI doesn't find a custom price, use the name as is (price will be 0)
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

      const newItem: Item = {
        id: crypto.randomUUID(),
        name: finalName,
        quantity,
        price,
        total: price * quantity,
        group,
        timestamp: new Date().toISOString(),
      };

      setItems((prevItems) => [...prevItems, newItem]);

    } catch (error) {
      console.error("Error adding item:", error);
      toast({
        variant: "destructive",
        title: "Erro ao adicionar item",
        description: "Ocorreu um problema ao processar o item.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearData = () => {
    setItems([]);
    toast({
      title: "Sucesso",
      description: "Todos os dados foram apagados.",
    });
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-headline font-bold text-primary sm:text-5xl">
          Restaurante da Mirinha
        </h1>
        <p className="text-muted-foreground mt-2">Controle de Pedidos</p>
      </header>

      <main className="space-y-8">
        <ItemForm onAddItem={handleAddItem} isProcessing={isProcessing} />

        <Card>
          <CardContent className="p-0">
            <Tabs defaultValue="pedidos" className="w-full">
              <TabsList className="rounded-t-lg rounded-b-none w-full justify-start border-b">
                <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="relatorio">Relatório Final</TabsTrigger>
              </TabsList>
              <div className="p-6">
                <TabsContent value="pedidos">
                  <ItemList items={items} />
                </TabsContent>
                <TabsContent value="resumo">
                  <SummaryReport items={items} />
                </TabsContent>
                <TabsContent value="relatorio">
                  <FinalReport items={items} />
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
        
        <div className="flex justify-center">
          <Button variant="destructive" onClick={handleClearData} size="lg">
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar Todos os Dados
          </Button>
        </div>
      </main>
    </div>
  );
}
