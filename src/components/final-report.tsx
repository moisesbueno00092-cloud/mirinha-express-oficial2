
"use client";

import { useMemo } from "react";
import type { Item, Group } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Share, FileText, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

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
    const totals: Record<Group, number> = {
      'Vendas salão': 0,
      'Fiados salão': 0,
      'Vendas rua': 0,
      'Fiados rua': 0,
    };
    
    const itemCounts: { [key: string]: { total: number; rua: number } } = {};
    let totalRuaItems = 0;

    const deliveryItems = items.filter(item => item.deliveryFee > 0);
    const deliveryCount = deliveryItems.reduce((acc, item) => acc + item.quantity, 0);
    const totalDeliveryFee = deliveryItems.reduce((acc, item) => acc + (item.deliveryFee * item.quantity), 0);

    items.forEach((item) => {
      totals[item.group] += item.total;

      const itemName = item.name.toUpperCase();
      if (!itemCounts[itemName]) {
        itemCounts[itemName] = { total: 0, rua: 0 };
      }

      if (itemName === 'KG') {
        // For KG items, we count occurrences, not quantity.
        itemCounts[itemName].total += 1;
      } else {
        itemCounts[itemName].total += item.quantity;
      }
      

      if (item.group.includes('rua')) {
        if (itemName === 'KG') {
           itemCounts[itemName].rua += 1;
        } else {
           itemCounts[itemName].rua += item.quantity;
        }
        totalRuaItems += item.quantity;
      }
    });
    
    const totalFaturamento = Object.values(totals).reduce((acc, val) => acc + val, 0);
    const totalGeralItems = items.reduce((acc, item) => {
        if (item.name.toUpperCase() === 'KG') {
            return acc + 1;
        }
        return acc + item.quantity;
    }, 0);
    
    const pieData = Object.entries(totals)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
            name,
            value,
            percent: totalFaturamento > 0 ? ((value / totalFaturamento) * 100).toFixed(0) : 0,
        }));
        
    const COLORS = {
        'Vendas salão': '#d92550',
        'Vendas rua': '#3498db',
        'Fiados salão': '#f1c40f',
        'Fiados rua': '#2ecc71',
    };

    const sortedItemCounts = Object.entries(itemCounts)
                                .sort(([, a], [, b]) => b.total - a.total);

    return { 
        totals,
        totalFaturamento,
        totalGeralItems,
        totalRuaItems,
        itemCounts: sortedItemCounts,
        pieData,
        COLORS,
        totalDeliveryFee,
        deliveryCount,
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
                        {Object.entries(reportData.totals).map(([group, total]) => (
                             <div key={group} className="flex justify-between">
                                <span className={cn("whitespace-nowrap", group.includes('Fiado') ? 'text-destructive' : '')}>{group}:</span>
                                <span className="font-mono font-medium">{formatCurrency(total)}</span>
                            </div>
                        ))}
                        {reportData.totalDeliveryFee > 0 && (
                            <div className="flex justify-between pt-2 border-t mt-2 text-muted-foreground">
                                <span>Taxa de Entrega ({reportData.deliveryCount}x):</span>
                                <span className="font-mono font-medium">{formatCurrency(reportData.totalDeliveryFee)}</span>
                            </div>
                        )}
                    </div>
                     <Separator />
                     <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between">
                            <span>Total Geral (Itens):</span>
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
                        <h3 className="font-semibold text-base sm:text-lg mb-2">Contagem de Itens</h3>
                        <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
                             <div>
                                <h4 className="font-medium mb-1">Total</h4>
                                <ul className="space-y-1">
                                    {reportData.itemCounts.map(([name, count]) => (
                                        <li key={name} className="flex justify-between">
                                            <span>{name}:</span>
                                            <span className="font-mono">{count.total}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                             <div>
                                <h4 className="font-medium mb-1">Rua</h4>
                                 <ul className="space-y-1">
                                    {reportData.itemCounts.filter(([, count]) => count.rua > 0).map(([name, count]) => (
                                        <li key={name} className="flex justify-between">
                                            <span>{name}:</span>
                                            <span className="font-mono">{count.rua}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
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
