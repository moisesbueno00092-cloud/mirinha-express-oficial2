
'use client';

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Settings, Info } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

export default function LaunchGuideSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Guia Rápido de Lançamentos</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Info className="h-5 w-5"/> Guia Rápido de Lançamentos</SheetTitle>
          <SheetDescription>
            Consulte as siglas e regras para fazer lançamentos de forma correta.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
            <div className="py-6">
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
                        <AccordionTrigger>Grupos e Taxas</AccordionTrigger>
                        <AccordionContent>
                           <ul className="list-disc pl-5 space-y-2 mt-2 text-sm text-muted-foreground">
                                <li><strong>Vendas na Rua (R):</strong> Inicie com <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">R</code>. A taxa de entrega padrão é adicionada automaticamente. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">R M P</code></li>
                                <li><strong>Fiados na Rua (FR):</strong> Inicie com <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">FR</code>. A taxa de entrega é adicionada e o nome do cliente é obrigatório no final. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">FR M G Maria</code></li>
                                <li><strong>Fiados no Salão (F):</strong> Inicie com <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">F</code>. O nome do cliente é obrigatório no final. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">F 2PP João</code></li>
                                <li><strong>Isenção de Taxa (E):</strong> Adicione <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">E</code> em qualquer parte do comando de rua para não cobrar a taxa. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">R P E</code></li>
                                <li><strong>Taxa Manual (TX):</strong> Use <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">TX</code> seguido do valor para definir uma taxa de entrega diferente. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">R M TX 5,00</code></li>
                           </ul>
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                        <AccordionTrigger>Lançamento de Itens</AccordionTrigger>
                        <AccordionContent>
                             <ul className="list-disc pl-5 space-y-2 mt-2 text-sm text-muted-foreground">
                                <li><strong>Itens Pré-definidos:</strong> Use as siglas dos lanches (PP, P, M, G, GG, KITM, KITG, PF, SL, SLKIT, S). O sistema usa o preço padrão.</li>
                                <li><strong>Quantidade:</strong> Coloque o número antes da sigla. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">2M</code> (dois lanches médios).</li>
                                <li><strong>Preço Personalizado:</strong> Para usar um preço diferente, coloque o valor depois da sigla. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">M 23,50</code></li>
                                <li><strong>Itens por Quilo (KG):</strong> Use a sigla <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">KG</code> seguida pelos valores de cada item. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">KG 25,50 18,20</code> (dois itens pesados).</li>
                                <li><strong>Itens da Bomboniere:</strong> Use o nome do item (ex: `coca-lata`) ou abra o menu "Outros". Para preço personalizado, use o formato <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">nome preço</code>. Ex: <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono">chocolate 4,50</code></li>
                            </ul>
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3">
                        <AccordionTrigger>Exemplos Práticos</AccordionTrigger>
                        <AccordionContent>
                             <ul className="list-disc pl-5 space-y-2 mt-2 text-sm text-muted-foreground">
                                <li><code>F 2M G João</code>: Fiado no salão para João, 2 lanches M e 1 G.</li>
                                <li><code>R PP chocolate 4,50 TX 5</code>: Venda na rua, 1 lanche PP, 1 chocolate a R$4,50 e uma taxa manual de R$5,00.</li>
                                <li><code>FR P M E Maria</code>: Fiado na rua para Maria, 1 lanche P e 1 M, com isenção de taxa.</li>
                                <li><code>2M P coca-lata 2</code>: Venda no salão, 2 lanches M, 1 P e 2 Cocas-Lata (preço padrão).</li>
                             </ul>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
