

"use client";

import { useMemo, useState } from "react";
import type { Item, Group } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Share, FileText, BrainCircuit, Save, History, Trash2, User, KeyRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestore } from "@/firebase";
import { doc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { setDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import Link from "next/link";
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
import { useRouter } from 'next/navigation';


interface FinalReportProps {
  items: Item[];
  onClearData: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = data.isCurrency ? formatCurrency(data.value) : data.value.toLocaleString('pt-BR');
    const percent = data.percent ? ` (${(data.percent * 100).toFixed(0)}%)` : '';
    return (
      <div className="bg-background border border-border p-2 rounded-lg shadow-lg text-xs">
        <p className="label">{`${data.name} : ${value}${percent}`}</p>
      </div>
    );
  }
  return null;
};


const PIE_CHART_COLORS: Record<string, string> = {
    // Faturamento por Grupo
    'Vendas salão': 'hsl(var(--chart-1))',
    'Fiados salão': 'hsl(var(--destructive))',
    'Vendas rua': 'hsl(var(--chart-2))',
    'Fiados rua': 'hsl(var(--chart-5))',
    // Proporção de Vendas
    'Refeições': 'hsl(var(--chart-1))',
    'Bomboniere': 'hsl(var(--chart-2))',
    'Entregas': 'hsl(var(--chart-3))',
};


export default function FinalReport({ items, onClearData }: FinalReportProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const reportData = useMemo(() => {
    if (items.length === 0) return null;

    const latestItemTimestamp = items.reduce((latest, item) => {
        const itemDate = new Date(item.timestamp);
        return itemDate > latest ? itemDate : latest;
    }, new Date(0));
    
    const reportDate = latestItemTimestamp > new Date(0) ? latestItemTimestamp : new Date();


    const totalsByGroup: Record<Group, number> = {
      'Vendas salão': 0,
      'Fiados salão': 0,
      'Vendas rua': 0,
      'Fiados rua': 0,
    };
    
    let totalBomboniereValue = 0;
    let totalBomboniereQuantity = 0;
    const itemCounts: { [key: string]: { total: number; rua: number; salao: number } } = {};
    const bomboniereItemCounts: { [key: string]: { quantity: number; total: number; rua: number; salao: number } } = {};
    
    let totalMealItems = 0;
    
    let deliveryCount = 0;
    let totalDeliveryFee = 0;

    const favoriteClientsFiado: Record<string, { name: string; total: number; items: number }> = {};

    items.forEach((item) => {
      totalsByGroup[item.group] += item.total;
      
      if (item.deliveryFee > 0) {
        deliveryCount++;
        totalDeliveryFee += item.deliveryFee;
      }
      
      const isRua = item.group.includes('rua');

      // Aggregate favorite client fiado data
      if (item.group.includes('Fiados') && item.customerId && item.customerName) {
        if (!favoriteClientsFiado[item.customerId]) {
          favoriteClientsFiado[item.customerId] = { name: item.customerName, total: 0, items: 0 };
        }
        favoriteClientsFiado[item.customerId].total += item.total;
        favoriteClientsFiado[item.customerId].items += 1;
      }

      if(item.bomboniereItems){
        item.bomboniereItems.forEach(bItem => {
            const bomboniereValue = bItem.price * bItem.quantity;
            totalBomboniereValue += bomboniereValue;
            totalBomboniereQuantity += bItem.quantity;

            if(!bomboniereItemCounts[bItem.name]){
                bomboniereItemCounts[bItem.name] = { quantity: 0, total: 0, rua: 0, salao: 0 };
            }
            bomboniereItemCounts[bItem.name].quantity += bItem.quantity;
            bomboniereItemCounts[bItem.name].total += bomboniereValue;
            if (isRua) {
                bomboniereItemCounts[bItem.name].rua += bItem.quantity;
            } else {
                bomboniereItemCounts[bItem.name].salao += bItem.quantity;
            }
        });
      }
      
      if(item.predefinedItems){
        item.predefinedItems.forEach(pItem => {
          if (!itemCounts[pItem.name]) {
            itemCounts[pItem.name] = { total: 0, rua: 0, salao: 0 };
          }
          itemCounts[pItem.name].total += 1;
          if (isRua) {
             itemCounts[pItem.name].rua += 1;
          } else {
            itemCounts[pItem.name].salao += 1;
          }
          totalMealItems += 1;
        });
      }
      
      if(item.individualPrices){
        const kgCount = item.individualPrices.length;
        if (!itemCounts['KG']) {
          itemCounts['KG'] = { total: 0, rua: 0, salao: 0 };
        }
        itemCounts['KG'].total += kgCount;
        if(isRua) {
            itemCounts['KG'].rua += kgCount;
        } else {
            itemCounts['KG'].salao += kgCount;
        }
        totalMealItems += kgCount;
      }
    });
    
    const totalFaturamento = Object.values(totalsByGroup).reduce((acc, val) => acc + val, 0);
    const totalMealValue = items.reduce((sum, item) => sum + (item.price - (item.bomboniereItems ? item.bomboniereItems.reduce((acc, bi) => acc + (bi.price * bi.quantity), 0) : 0)), 0);
    const totalAVista = totalsByGroup['Vendas salão'] + totalsByGroup['Vendas rua'];
    const totalFiado = totalsByGroup['Fiados salão'] + totalsByGroup['Fiados rua'];
    const totalSalao = totalsByGroup['Vendas salão'] + totalsByGroup['Fiados salão'];
    const totalRua = totalsByGroup['Vendas rua'] + totalsByGroup['Fiados rua'];


    // Lógica para os Gráficos
    
    // 1. Faturamento por Grupo
    const faturamentoByGroupData = Object.entries(totalsByGroup)
        .map(([name, value]) => ({
            name: name as Group,
            value: value,
        }))
        .filter(d => d.value > 0);
    const totalFaturamentoForPercent = faturamentoByGroupData.reduce((sum, item) => sum + item.value, 0);
    const faturamentoByGroupDataWithPercent = faturamentoByGroupData.map(item => ({...item, percent: totalFaturamentoForPercent > 0 ? (item.value / totalFaturamentoForPercent) : 0, isCurrency: true}));


    // 2. Proporção de Vendas (Receita)
    const salesProportionData = [
      { name: 'Refeições', value: totalMealValue, isCurrency: true },
      { name: 'Bomboniere', value: totalBomboniereValue, isCurrency: true },
      { name: 'Entregas', value: totalDeliveryFee, isCurrency: true },
    ].filter(d => d.value > 0);
    const salesTotalForProportion = salesProportionData.reduce((sum, item) => sum + item.value, 0);
    const salesProportionDataWithPercent = salesProportionData.map(d => ({
        ...d,
        percent: salesTotalForProportion > 0 ? (d.value / salesTotalForProportion) : 0,
    }));
    
    // 3. Contagem de Itens
    const itemsCountData = [
      { name: 'Refeições', value: totalMealItems },
      { name: 'Bomboniere', value: totalBomboniereQuantity },
    ].filter(d => d.value > 0);
    const totalItemsCount = itemsCountData.reduce((sum, item) => sum + item.value, 0);
    const itemsCountDataWithPercent = itemsCountData.map(d => ({
        ...d,
        percent: totalItemsCount > 0 ? (d.value / totalItemsCount) : 0
    }));

    const sortedItemCounts = Object.entries(itemCounts).sort(([, a], [, b]) => b.total - a.total);
    const sortedBomboniereCounts = Object.entries(bomboniereItemCounts).sort(([, a], [, b]) => b.total - a.total);
    const sortedFavoriteClients = Object.values(favoriteClientsFiado).sort((a,b) => b.total - a.total);

    return { 
        reportDate,
        totalsByGroup,
        totalFaturamento,
        totalAVista,
        totalFiado,
        totalSalao,
        totalRua,
        deliveryCount,
        totalDeliveryFee,
        totalMealItems,
        totalBomboniereQuantity,
        totalRuaItems: items.filter(i => i.group.includes('rua')).reduce((acc, i) => acc + i.quantity, 0),
        itemCounts: sortedItemCounts,
        bomboniereItemCounts: sortedBomboniereCounts,
        salesProportionData: salesProportionDataWithPercent,
        faturamentoByGroupData: faturamentoByGroupDataWithPercent,
        itemsCountData: itemsCountDataWithPercent,
        totalBomboniereValue,
        totalMealValue,
        favoriteClientsFiado: sortedFavoriteClients,
    };
  }, [items]);
  

  const handleSaveAndClear = async () => {
    if (!firestore || !reportData) return;
    
    const reportId = reportData.reportDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const reportTimestamp = reportData.reportDate.toISOString();

    // 1. Salvar o relatório
    const reportDocRef = doc(firestore, "daily_reports", reportId);
    
    const itemCountsAsObject = Object.fromEntries(reportData.itemCounts);
    const bomboniereItemCountsAsObject = Object.fromEntries(reportData.bomboniereItemCounts);

    const reportToSave = {
      id: reportId,
      timestamp: reportTimestamp,
      reportData: {
        totalFaturamento: reportData.totalFaturamento,
        totalAVista: reportData.totalAVista,
        totalFiado: reportData.totalFiado,
        totalSalao: reportData.totalSalao,
        totalRua: reportData.totalRua,
        deliveryCount: reportData.deliveryCount,
        totalDeliveryFee: reportData.totalDeliveryFee,
        totalMealItems: reportData.totalMealItems,
        totalBomboniereValue: reportData.totalBomboniereValue,
        totalBomboniereQuantity: reportData.totalBomboniereQuantity,
        totalsByGroup: reportData.totalsByGroup,
        itemCounts: itemCountsAsObject,
        bomboniereItemCounts: bomboniereItemCountsAsObject,
        totalMealValue: reportData.totalMealValue,
      },
      rawItems: items,
    };
    
    setDocumentNonBlocking(reportDocRef, reportToSave, { merge: true });

    // 2. Limpar os itens do dia
    try {
      items.forEach(item => {
        const docRef = doc(firestore, "order_items", item.id);
        deleteDocumentNonBlocking(docRef);
      });
      toast({
        title: "Relatório Salvo e Dia Encerrado!",
        description: `O relatório de ${reportData.reportDate.toLocaleDateString('pt-BR')} foi salvo.`,
      });
    } catch (error) {
       console.error("Error clearing data after saving report:", error);
       toast({
        variant: "destructive",
        title: "Erro ao limpar dados",
        description: "O relatório foi salvo, mas ocorreu um problema ao limpar os itens do dia.",
      });
    }
  };

  if (items.length === 0 || !reportData) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>Nenhum dado para exibir no relatório.</p>
        <Link href="/history" passHref>
          <Button variant="outline" className="mt-4">
            <History className="mr-2 h-4 w-4" />
            Ver Histórico de Relatórios
          </Button>
        </Link>
      </div>
    );
  }
  
  const reportDateFormatted = reportData.reportDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, percent }: any) => {
    const radius = outerRadius + 12;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="currentColor"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-xs text-foreground"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  
  const renderPieChart = (data: any[], title: string) => (
    <div className="flex-1 min-w-[200px] flex flex-col">
        <h3 className="font-semibold text-base sm:text-lg mb-2 text-center">{title}</h3>
        <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={renderCustomizedLabel}
                        outerRadius={60}
                        innerRadius={0}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        className="text-xs focus:outline-none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[entry.name as keyof typeof PIE_CHART_COLORS] || 'hsl(var(--muted))'} stroke={'hsl(var(--background))'} />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{fontSize: "12px", paddingTop: "10px", marginTop: "10px"}} 
                      iconSize={10} 
                      layout="horizontal" 
                      verticalAlign="bottom" 
                      align="center"
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    </div>
  );

  return (
    <>
      <div className="bg-card text-card-foreground rounded-lg p-2 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-wrap gap-2 justify-between items-center">
            <div>
                <h2 className="text-xl sm:text-2xl font-bold">Relatório do Dia</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">{reportDateFormatted}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" className="text-xs sm:text-sm" onClick={onClearData} disabled={!items || items.length === 0}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Limpar Dados
                </Button>
                <Link href="/history" passHref>
                    <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                        <History className="mr-2 h-4 w-4" />
                        Histórico
                    </Button>
                </Link>
                <Button variant="destructive" size="sm" className="text-xs sm:text-sm" onClick={handleSaveAndClear}>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar e Encerrar
                </Button>
            </div>
        </div>

        <Card className="bg-background/50">
            <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-6">
                <CardTitle className="text-lg sm:text-xl">Faturamento do Dia</CardTitle>
                <CardDescription className="text-lg sm:text-2xl font-bold text-primary">
                    {formatCurrency(reportData.totalFaturamento)}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 px-3 pb-3 sm:px-6 sm:pb-6">
                <div className="space-y-3 sm:space-y-4">
                    <h3 className="font-semibold text-base sm:text-lg">Resumo Financeiro</h3>
                    <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between">
                            <span>À Vista (Salão):</span>
                            <span className="font-mono font-medium">{formatCurrency(reportData.totalsByGroup['Vendas salão'])}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>À Vista (Rua):</span>
                            <span className="font-mono font-medium">{formatCurrency(reportData.totalsByGroup['Vendas rua'])}</span>
                        </div>
                        <div className="flex justify-between text-destructive">
                            <span>Fiado (Salão):</span>
                            <span className="font-mono font-medium">{formatCurrency(reportData.totalsByGroup['Fiados salão'])}</span>
                        </div>
                         <div className="flex justify-between text-destructive">
                            <span>Fiado (Rua):</span>
                            <span className="font-mono font-medium">{formatCurrency(reportData.totalsByGroup['Fiados rua'])}</span>
                        </div>
                        <div className="flex justify-between text-yellow-500">
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
                        <div className="flex justify-between font-bold">
                            <span>Total Salão:</span>
                            <span className="font-mono">{formatCurrency(reportData.totalSalao)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                            <span>Total Rua:</span>
                            <span className="font-mono">{formatCurrency(reportData.totalRua)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap justify-around items-start gap-4">
                  {reportData.faturamentoByGroupData.length > 0 && renderPieChart(reportData.faturamentoByGroupData, 'Faturamento por Grupo')}
                  {reportData.salesProportionData.length > 0 && renderPieChart(reportData.salesProportionData, 'Proporção de Vendas')}
                  {reportData.itemsCountData.length > 0 && renderPieChart(reportData.itemsCountData, 'Contagem de Itens')}
                </div>
            </CardContent>
        </Card>
        
        {reportData.favoriteClientsFiado.length > 0 && (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-base sm:text-lg">Fechamento de Clientes Fiado</CardTitle>
                            <CardDescription className="text-xs sm:text-sm">Resumo do período para clientes favoritos.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => router.push('/accounts')}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            Ver Detalhes
                        </Button>
                    </div>
                </CardHeader>
            </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base sm:text-lg">Contagem de Refeições</CardTitle>
                </CardHeader>
                <CardContent className="text-xs sm:text-sm space-y-2">
                    <div className="grid grid-cols-3 gap-x-4 font-medium mb-1 border-b pb-1">
                        <h4 className="text-left">Total</h4>
                        <h4 className="text-left">Salão</h4>
                        <h4 className="text-left">Rua</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-x-4">
                        <ul className="space-y-1">
                            {reportData.itemCounts.map(([name, count]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{name}:</span>
                                        <span className="font-mono">{count.total}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1">
                            {reportData.itemCounts.filter(([, count]) => count.salao > 0).map(([name, count]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{name}:</span>
                                        <span className="font-mono">{count.salao}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1">
                            {reportData.itemCounts.filter(([, count]) => count.rua > 0).map(([name, count]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{name}:</span>
                                        <span className="font-mono">{count.rua}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </CardContent>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle className="text-base sm:text-lg">Contagem de Bomboniere</CardTitle>
                </CardHeader>
                <CardContent className="text-xs sm:text-sm space-y-2">
                    <div className="grid grid-cols-3 gap-x-4 font-medium mb-1 border-b pb-1">
                        <h4 className="text-left">Total</h4>
                        <h4 className="text-left">Salão</h4>
                        <h4 className="text-left">Rua</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-x-4">
                        <ul className="space-y-1">
                            {reportData.bomboniereItemCounts.map(([name, data]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{data.quantity}x</span>
                                        <span>{name}</span>
                                    </div>
                                    <span className="font-mono">{formatCurrency(data.total)}</span>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1">
                            {reportData.bomboniereItemCounts.filter(([, data]) => data.salao > 0).map(([name, data]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{data.salao}x</span>
                                        <span>{name}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1">
                            {reportData.bomboniereItemCounts.filter(([, data]) => data.rua > 0).map(([name, data]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{data.rua}x</span>
                                        <span>{name}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
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
                 <Button variant="secondary" className="flex-1 text-xs smtext-sm">
                     Exportar para WPS
                 </Button>
                 <Button variant="secondary" className="flex-1 text-xs sm:text-sm">
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Analisar com IA
                 </Button>
            </div>
        </div>
    </div>
    </>
  );
}
