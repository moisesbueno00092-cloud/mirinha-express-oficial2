
"use client";

import { useMemo } from "react";
import type { Item, Group } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Share, FileText, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOMBONIERE_ITEMS_DEFAULT } from "@/lib/constants";

interface FinalReportProps {
  items: Item[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border p-2 rounded-lg shadow-lg text-xs">
        <p className="label">{`${payload[0].name} : ${formatCurrency(payload[0].value)} (${payload[0].payload.percent}%)`}</p>
      </div>
    );
  }
  return null;
};

export default function FinalReport({ items }: FinalReportProps) {
  const reportData = useMemo(() => {
    const totalsByGroup: Record<Group, number> = {
      'Vendas salão': 0,
      'Fiados salão': 0,
      'Vendas rua': 0,
      'Fiados rua': 0,
    };
    
    let totalBomboniereValue = 0;
    const itemCounts: { [key: string]: { total: number; rua: number } } = {};
    const bomboniereItemCounts: { [key: string]: { quantity: number; total: number } } = {};
    
    let totalRuaItems = 0;
    let totalGeralItems = 0;
    
    let deliveryCount = 0;
    let totalDeliveryFee = 0;

    items.forEach((item) => {
      totalsByGroup[item.group] += item.total;
      
      if (item.deliveryFee > 0) {
        deliveryCount++;
        totalDeliveryFee += item.deliveryFee;
      }
      
      let currentItemBomboniereValue = 0;

      if(item.bomboniereItems){
        item.bomboniereItems.forEach(bItem => {
            const bomboniereValue = bItem.price * bItem.quantity;
            totalBomboniereValue += bomboniereValue;
            currentItemBomboniereValue += bomboniereValue;

            if(!bomboniereItemCounts[bItem.name]){
                bomboniereItemCounts[bItem.name] = { quantity: 0, total: 0 };
            }
            bomboniereItemCounts[bItem.name].quantity += bItem.quantity;
            bomboniereItemCounts[bItem.name].total += bomboniereValue;
        });
      }
      
      const isRua = item.group.includes('rua');
      
      if(item.predefinedItems){
        item.predefinedItems.forEach(pItem => {
          if (!itemCounts[pItem.name]) {
            itemCounts[pItem.name] = { total: 0, rua: 0 };
          }
          itemCounts[pItem.name].total += 1;
          if (isRua) itemCounts[pItem.name].rua += 1;
          totalGeralItems += 1;
          if(isRua) totalRuaItems += 1;
        });
      }
      
      if(item.individualPrices){
        const kgCount = item.individualPrices.length;
        if (!itemCounts['KG']) {
          itemCounts['KG'] = { total: 0, rua: 0 };
        }
        itemCounts['KG'].total += kgCount;
        if(isRua) itemCounts['KG'].rua += kgCount;
        totalGeralItems += kgCount;
        if(isRua) totalRuaItems += kgCount;
      }
    });
    
    const totalFaturamento = Object.values(totalsByGroup).reduce((acc, val) => acc + val, 0);
    const totalMealValue = totalFaturamento - totalBomboniereValue;
    const totalAVista = totalsByGroup['Vendas salão'] + totalsByGroup['Vendas rua'];
    const totalFiado = totalsByGroup['Fiados salão'] + totalsByGroup['Fiados rua'];

    const pieData = [
      { name: 'Refeições', value: totalMealValue, percent: totalFaturamento > 0 ? ((totalMealValue / totalFaturamento) * 100).toFixed(0) : 0 },
      { name: 'Bomboniere', value: totalBomboniereValue, percent: totalFaturamento > 0 ? ((totalBomboniereValue / totalFaturamento) * 100).toFixed(0) : 0 },
    ].filter(d => d.value > 0);
        
    const COLORS = {
        'Refeições': '#d92550',
        'Bomboniere': '#3498db',
    };

    const sortedItemCounts = Object.entries(itemCounts).sort(([, a], [, b]) => b.total - a.total);
    const sortedBomboniereCounts = Object.entries(bomboniereItemCounts).sort(([, a], [, b]) => b.total - a.total);

    return { 
        totalsByGroup,
        totalFaturamento,
        totalAVista,
        totalFiado,
        deliveryCount,
        totalDeliveryFee,
        totalGeralItems,
        totalRuaItems,
        itemCounts: sortedItemCounts,
        bomboniereItemCounts: sortedBomboniereCounts,
        pieData,
        COLORS,
        totalBomboniereValue,
        totalMealValue,
    };
  }, [items]);
  
  const currentDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>Nenhum dado para exibir no relatório.</p>
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground rounded-lg p-2 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-xl sm:text-2xl font-bold">Relatório do Dia</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">{currentDate}</p>
            </div>
            <Button variant="destructive" size="sm" className="text-xs sm:text-sm">
                Salvar Relatório Final
            </Button>
        </div>

        <Card className="bg-background/50">
            <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-6">
                <CardTitle className="text-lg sm:text-xl">Faturamento do Dia</CardTitle>
                <CardDescription className="text-lg sm:text-2xl font-bold text-primary">
                    {formatCurrency(reportData.totalFaturamento)}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 px-3 pb-3 sm:px-6 sm:pb-6">
                <div className="space-y-3 sm:space-y-4">
                    <h3 className="font-semibold text-base sm:text-lg">Resumo Financeiro</h3>
                    <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between">
                            <span>À Vista:</span>
                            <span className="font-mono font-medium">{formatCurrency(reportData.totalAVista)}</span>
                        </div>
                        <div className="flex justify-between text-destructive">
                            <span>Fiado:</span>
                            <span className="font-mono font-medium">{formatCurrency(reportData.totalFiado)}</span>
                        </div>
                        <div className="flex justify-between text-destructive">
                           <span>Entregas ({reportData.deliveryCount}):</span>
                           <span className="font-mono font-medium">{formatCurrency(reportData.totalDeliveryFee)}</span>
                        </div>
                    </div>
                     <Separator />
                     <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between font-bold">
                            <span>Total Refeições:</span>
                            <span className="font-mono">{formatCurrency(reportData.totalMealValue)}</span>
                        </div>
                         <div className="flex justify-between font-bold">
                            <span>Total Bomboniere:</span>
                            <span className="font-mono">{formatCurrency(reportData.totalBomboniereValue)}</span>
                        </div>
                    </div>
                     <Separator />
                     <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between">
                            <span>Total Itens (Refeições):</span>
                            <span className="font-mono font-medium">{reportData.totalGeralItems}</span>
                        </div>
                         <div className="flex justify-between">
                            <span>Total Itens (Rua):</span>
                            <span className="font-mono font-medium">{reportData.totalRuaItems}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 sm:space-y-6">
                     <div>
                        <h3 className="font-semibold text-base sm:text-lg mb-2">Proporção de Vendas</h3>
                        <div style={{ width: '100%', height: 180 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={reportData.pieData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        outerRadius={60}
                                        innerRadius={25}
                                        fill="#8884d8"
                                        dataKey="value"
                                        nameKey="name"
                                        label={({ percent }) => `${percent}%`}
                                        className="text-xs"
                                    >
                                        {reportData.pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={reportData.COLORS[entry.name as keyof typeof reportData.COLORS]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{fontSize: "10px"}} iconSize={8} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base sm:text-lg">Contagem de Refeições</CardTitle>
                </CardHeader>
                <CardContent className="text-xs sm:text-sm">
                    <div className="grid grid-cols-2 gap-x-4">
                        <div>
                            <h4 className="font-medium mb-1 border-b pb-1">Total</h4>
                            <ul className="space-y-1 mt-2">
                                {reportData.itemCounts.map(([name, count]) => (
                                    <li key={name} className="flex justify-between">
                                        <span>{name}:</span>
                                        <span className="font-mono">{count.total}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium mb-1 border-b pb-1">Rua</h4>
                            <ul className="space-y-1 mt-2">
                                {reportData.itemCounts.filter(([, count]) => count.rua > 0).map(([name, count]) => (
                                    <li key={name} className="flex justify-between">
                                        <span>{name}:</span>
                                        <span className="font-mono">{count.rua}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle className="text-base sm:text-lg">Contagem de Bomboniere</CardTitle>
                </CardHeader>
                <CardContent className="text-xs sm:text-sm">
                     <ul className="space-y-1">
                        {reportData.bomboniereItemCounts.map(([name, data]) => (
                            <li key={name} className="flex justify-between">
                                <span>{data.quantity}x {name}</span>
                                <span className="font-mono">{formatCurrency(data.total)}</span>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
        
        <div>
            <h3 className="font-semibold text-base sm:text-lg mb-2">Ações</h3>
            <div className="flex flex-col sm:flex-row gap-2">
                 <Button variant="destructive" className="flex-1 text-xs sm:text-sm">
                    <Share className="mr-2 h-4 w-4" />
                    Enviar via WhatsApp
                 </Button>
                 <Button variant="secondary" className="flex-1 text-xs sm:text-sm">
                    <FileText className="mr-2 h-4 w-4" />
                     Exportar para WPS
                 </Button>
                 <Button variant="secondary" className="flex-1 text-xs sm:text-sm">
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Analisar com IA
                 </Button>
            </div>
        </div>
    </div>
  );
}
