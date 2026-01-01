
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Settings, BookOpen } from 'lucide-react';
import { PREDEFINED_PRICES } from '@/lib/constants';

const productNames: Record<string, string> = {
    PP: "Marmita extra pequena",
    P: "Pequena",
    M: "Média",
    G: "Grande",
    GG: "Extra Grande",
    KITM: "Kit Família Médio",
    KITG: "Kit Família Grande",
    PF: "Prato Feito",
    SL: "Salada de Frutas",
    SLKIT: "Kit Salada",
    S: "X-Salada",
    KG: "Quilo (Refeição)"
}

export default function HelpSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Ajuda e Informações</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[350px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5"/> Guia de Referência Rápida</SheetTitle>
          <SheetDescription>
            Aqui estão todas as regras, códigos e siglas utilizados no sistema.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 py-6 text-sm">
            
            <section>
                <h3 className="font-semibold text-lg mb-2 text-primary">Lançamento de Pedidos (Página Principal)</h3>
                <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
                    <li><span className="font-semibold text-foreground">`R [itens]`</span>: Pedido para <span className="font-bold">R</span>ua (aplica taxa de entrega padrão).</li>
                    <li><span className="font-semibold text-foreground">`F [nome] [itens]`</span>: Pedido <span className="font-bold">F</span>iado para um cliente no salão.</li>
                    <li><span className="font-semibold text-foreground">`FR [nome] [itens]`</span>: Pedido <span className="font-bold">F</span>iado para <span className="font-bold">R</span>ua.</li>
                    <li><span className="font-semibold text-foreground">`... E`</span>: Adicionar a letra <span className="font-bold">E</span> no final isenta a taxa de entrega.</li>
                    <li><span className="font-semibold text-foreground">`... TX [valor]`</span>: Define uma <span className="font-bold">T</span>a<span className="font-bold">X</span>a de entrega personalizada.</li>
                    <li><span className="font-semibold text-foreground">`KG [preço]`</span>: Lançamento de um prato por <span className="font-bold">K</span>ilo<span className="font-bold">G</span>rama.</li>
                    <li><span className="font-semibold text-foreground">`[Qtd][Item] [Preço]`</span>: Para itens da bomboniere com preço personalizado. Ex: <span className="font-mono">`2bala 0.75`</span></li>
                </ul>
            </section>

            <section>
                <h3 className="font-semibold text-lg mb-2 text-primary">Siglas de Produtos</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.keys(PREDEFINED_PRICES).map(key => (
                         <div key={key} className="flex items-baseline gap-2">
                             <span className="font-mono font-bold text-foreground w-8">{key}:</span>
                             <span className="text-muted-foreground">{productNames[key] || key}</span>
                         </div>
                    ))}
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono font-bold text-foreground w-8">KG:</span>
                        <span className="text-muted-foreground">Refeição por Quilo</span>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="font-semibold text-lg mb-2 text-primary">Entrada de Mercadorias (Admin)</h3>
                 <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
                    <li><span className="font-semibold text-foreground">`[Produto] [Preço Total]`</span>: Para itens únicos. Ex: <span className="font-mono">`Caixa de Tomate 55,00`</span></li>
                    <li><span className="font-semibold text-foreground">`[Produto] un/kg [Qtd] [Preço Unitário]`</span>: Para múltiplos itens ou por peso. Ex: <span className="font-mono">`Queijo kg 2 35`</span> (2kg a 35,00/kg).</li>
                </ul>
            </section>

            <section>
                <h3 className="font-semibold text-lg mb-2 text-primary">Lançamentos de RH (Admin)</h3>
                 <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
                    <li><span className="font-semibold text-foreground">`[Nome Funcionário] [tipo] [valor]`</span>: Lançamento rápido.</li>
                    <li><span className="font-bold">Tipos válidos:</span> <span className="font-mono">vale</span>, <span className="font-mono">bonus</span>, <span className="font-mono">desconto</span>.</li>
                     <li><span className="font-bold">Exemplo:</span> <span className="font-mono">`João Silva vale 50`</span></li>
                </ul>
            </section>

        </div>
      </SheetContent>
    </Sheet>
  );
}
