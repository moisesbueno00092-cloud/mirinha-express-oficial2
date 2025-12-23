
"use client";

import { useMemo, useState } from "react";
import type { Item, Group, DailyReport } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Share, FileText, BrainCircuit, Save, History, Trash2, User, KeyRound, Loader2, AlertTriangle, TrendingUp, ShoppingCart, Users, Coins, Utensils, Package, Truck } from "lucide-react";
import { useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
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
    if (typeof value !== 'number' || isNaN(value)) {
        return 'R$ --,--';
    }
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
  const [isSaving, setIsSaving] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);


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
    const itemCounts: { [key: string]: { total: number; rua: number; salao: number; totalValue: number } } = {};
    const bomboniereItemCounts: { [key: string]: { quantity: number; totalValue: number; rua_qty: number; salao_qty: number } } = {};
    
    let totalMealItems = 0;
    let totalMealValue = 0;
    
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
      const itemMealValue = item.price - (item.bomboniereItems ? item.bomboniereItems.reduce((acc, bi) => acc + (bi.price * bi.quantity), 0) : 0);
      totalMealValue += itemMealValue;


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
                bomboniereItemCounts[bItem.name] = { quantity: 0, totalValue: 0, rua_qty: 0, salao_qty: 0 };
            }
            bomboniereItemCounts[bItem.name].quantity += bItem.quantity;
            bomboniereItemCounts[bItem.name].totalValue += bomboniereValue;
            if (isRua) {
                bomboniereItemCounts[bItem.name].rua_qty += bItem.quantity;
            } else {
                bomboniereItemCounts[bItem.name].salao_qty += bItem.quantity;
            }
        });
      }
      
      if(item.predefinedItems){
        item.predefinedItems.forEach(pItem => {
          if (!itemCounts[pItem.name]) {
            itemCounts[pItem.name] = { total: 0, rua: 0, salao: 0, totalValue: 0 };
          }
          itemCounts[pItem.name].total += 1;
          itemCounts[pItem.name].totalValue += pItem.price;
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
        const kgValue = item.individualPrices.reduce((a, b) => a + b, 0);
        if (!itemCounts['KG']) {
          itemCounts['KG'] = { total: 0, rua: 0, salao: 0, totalValue: 0 };
        }
        itemCounts['KG'].total += kgCount;
        itemCounts['KG'].totalValue += kgValue;
        if(isRua) {
            itemCounts['KG'].rua += kgCount;
        } else {
            itemCounts['KG'].salao += kgCount;
        }
        totalMealItems += kgCount;
      }
    });
    
    const totalFaturamento = Object.values(totalsByGroup).reduce((acc, val) => acc + val, 0);
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
    const sortedBomboniereCounts = Object.entries(bomboniereItemCounts).sort(([, a], [, b]) => b.totalValue - a.totalValue);
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
  
  const proceedWithSaveAndClear = () => {
    if (!firestore || !reportData) return;
    
    setIsSaving(true);
    setShowOverwriteConfirm(false);

    const reportId = reportData.reportDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const reportTimestamp = reportData.reportDate.toISOString();

    const reportDocRef = doc(firestore, "daily_reports", reportId);
    
    const itemCountsAsObject = Object.fromEntries(reportData.itemCounts);
    const bomboniereItemCountsAsObject = Object.fromEntries(reportData.bomboniereItemCounts);

    const reportToSave: Omit<DailyReport, 'id' | 'rawItems'> & { rawItems: Item[] } = {
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
    
    // Use merge: true to overwrite, as confirmed by the user.
    setDocumentNonBlocking(reportDocRef, { ...reportToSave, id: reportId }, { merge: true });

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
    } finally {
        setIsSaving(false);
    }
  };

  const handleSaveAndClear = async () => {
    if (!firestore || !reportData || isSaving) return;

    setIsSaving(true);
    const reportId = reportData.reportDate.toISOString().split('T')[0];
    const reportDocRef = doc(firestore, "daily_reports", reportId);

    try {
      const existingReport = await getDoc(reportDocRef);
      if (existingReport.exists()) {
        setShowOverwriteConfirm(true);
      } else {
        proceedWithSaveAndClear();
      }
    } catch (error) {
        console.error("Error checking for existing report:", error);
        toast({
            variant: "destructive",
            title: "Erro de Verificação",
            description: "Não foi possível verificar se o relatório já existe. Tente novamente."
        });
    } finally {
        if (!showOverwriteConfirm) {
            setIsSaving(false);
        }
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
        <h3 className="font-semibold text-sm mb-2 text-center text-muted-foreground">{title}</h3>
        <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={renderCustomizedLabel}
                        outerRadius={50}
                        innerRadius={25}
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
                      wrapperStyle={{fontSize: "11px", paddingTop: "10px", marginTop: "5px"}} 
                      iconSize={8} 
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
      <AlertDialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-6 w-6" />
              Substituir Relatório Existente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um relatório salvo para o dia {reportDateFormatted}. Deseja substituí-lo pelo novo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsSaving(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithSaveAndClear}>
              Sim, Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="bg-card text-card-foreground rounded-lg p-2 sm:p-4 space-y-4">
        <div className="flex flex-wrap gap-2 justify-between items-center border-b pb-4">
            <div>
                <h2 className="text-xl sm:text-2xl font-bold">Relatório do Dia</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">{reportDateFormatted}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={onClearData} disabled={!items || items.length === 0}>
                    <Trash2 className="mr-2 h-3 w-3" />
                    Limpar
                </Button>
                <Link href="/history" passHref>
                    <Button variant="outline" size="sm" className="text-xs">
                        <History className="mr-2 h-3 w-3" />
                        Histórico
                    </Button>
                </Link>
                <Button variant="default" size="sm" className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSaveAndClear} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                  {isSaving ? 'A Guardar...' : 'Salvar e Encerrar'}
                </Button>
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 space-y-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                           <Coins className="h-4 w-4 text-muted-foreground" />
                           <span>Resumo Financeiro</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div className="flex justify-between"><span>À Vista (Salão):</span> <span className="font-mono">{formatCurrency(reportData.totalsByGroup['Vendas salão'])}</span></div>
                        <div className="flex justify-between"><span>À Vista (Rua):</span> <span className="font-mono">{formatCurrency(reportData.totalsByGroup['Vendas rua'])}</span></div>
                        <div className="flex justify-between text-destructive"><span>Fiado (Salão):</span> <span className="font-mono">{formatCurrency(reportData.totalsByGroup['Fiados salão'])}</span></div>
                        <div className="flex justify-between text-destructive"><span>Fiado (Rua):</span> <span className="font-mono">{formatCurrency(reportData.totalsByGroup['Fiados rua'])}</span></div>
                        <Separator />
                        <div className="flex justify-between font-bold"><span>Total Salão:</span> <span className="font-mono">{formatCurrency(reportData.totalSalao)}</span></div>
                        <div className="flex justify-between font-bold"><span>Total Rua:</span> <span className="font-mono">{formatCurrency(reportData.totalRua)}</span></div>
                        <Separator />
                        <div className="flex justify-between font-bold text-primary text-base"><span>Faturamento Total:</span> <span className="font-mono">{formatCurrency(reportData.totalFaturamento)}</span></div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                           <Truck className="h-4 w-4 text-muted-foreground" />
                           <span>Resumo de Entregas</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div className="flex justify-between"><span>Nº de Entregas:</span> <span className="font-bold">{reportData.deliveryCount}</span></div>
                        <div className="flex justify-between"><span>Taxa de Entrega Total:</span> <span className="font-mono font-bold">{formatCurrency(reportData.totalDeliveryFee)}</span></div>
                    </CardContent>
                </Card>

                 {reportData.favoriteClientsFiado.length > 0 && (
                    <Card>
                        <CardHeader className="flex flex-row justify-between items-center pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                               <Users className="h-4 w-4 text-muted-foreground" />
                               <span>Clientes Fiado</span>
                            </CardTitle>
                             <Button variant="ghost" size="sm" className="h-7 -mr-2" onClick={() => router.push('/accounts')}>
                                Ver Todos
                            </Button>
                        </CardHeader>
                    </Card>
                )}
            </div>
            <div className="md:col-span-2">
                <Card>
                    <CardHeader className="pb-2">
                         <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                           <span>Análise Gráfica</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap justify-around items-start gap-4">
                        {reportData.faturamentoByGroupData.length > 0 && renderPieChart(reportData.faturamentoByGroupData, 'Faturamento por Grupo')}
                        {reportData.salesProportionData.length > 0 && renderPieChart(reportData.salesProportionData, 'Proporção de Vendas')}
                        {reportData.itemsCountData.length > 0 && renderPieChart(reportData.itemsCountData, 'Contagem de Itens')}
                    </CardContent>
                </Card>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Utensils className="h-4 w-4 text-muted-foreground" />
                        <span>Contagem de Refeições ({reportData.totalMealItems})</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-xs sm:text-sm pt-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div>
                          <h4 className="font-semibold mb-1">Salão</h4>
                          {reportData.itemCounts.filter(([, count]) => count.salao > 0).map(([name, count]) => (
                            <div key={`${name}-salao`} className="flex justify-between"><span>{count.salao}x {name}</span></div>
                          ))}
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1">Rua</h4>
                          {reportData.itemCounts.filter(([, count]) => count.rua > 0).map(([name, count]) => (
                            <div key={`${name}-rua`} className="flex justify-between"><span>{count.rua}x {name}</span></div>
                          ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span>Contagem de Bomboniere ({reportData.totalBomboniereQuantity})</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-xs sm:text-sm pt-2">
                     <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div>
                            <h4 className="font-semibold mb-1">Salão</h4>
                            {reportData.bomboniereItemCounts.filter(([, data]) => data.salao_qty > 0).map(([name, data]) => (
                                <div key={`${name}-salao`} className="flex justify-between"><span>{data.salao_qty}x {name}</span></div>
                            ))}
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Rua</h4>
                            {reportData.bomboniereItemCounts.filter(([, data]) => data.rua_qty > 0).map(([name, data]) => (
                                <div key={`${name}-rua`} className="flex justify-between"><span>{data.rua_qty}x {name}</span></div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
        
        <div>
            <h3 className="font-semibold text-base mb-2">Ações</h3>
            <div className="flex flex-col sm:flex-row gap-2">
                 <Button variant="outline" className="flex-1 text-xs">
                    <Share className="mr-2 h-4 w-4" />
                    Enviar via WhatsApp
                 </Button>
                 <Button variant="outline" className="flex-1 text-xs">
                     <FileText className="mr-2 h-4 w-4" />
                     Exportar para WPS
                 </Button>
                 <Button variant="outline" className="flex-1 text-xs">
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Analisar com IA
                 </Button>
            </div>
        </div>
    </div>
    </>
  );
}
