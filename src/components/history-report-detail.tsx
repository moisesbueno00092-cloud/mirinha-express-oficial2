
'use client';

import { DailyReport, Group } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Trash2, TrendingUp, Coins, Users, Utensils, Package, FileText, BrainCircuit, Share, Truck } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';

interface HistoryReportDetailProps {
  report: DailyReport;
  onBack: () => void;
  onDelete: () => void;
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
    'Vendas salão': 'hsl(var(--chart-1))',
    'Fiados salão': 'hsl(var(--destructive))',
    'Vendas rua': 'hsl(var(--chart-2))',
    'Fiados rua': 'hsl(var(--chart-5))',
    'Refeições': 'hsl(var(--chart-1))',
    'Bomboniere': 'hsl(var(--chart-2))',
    'Entregas': 'hsl(var(--chart-3))',
};

export default function HistoryReportDetail({ report, onBack, onDelete }: HistoryReportDetailProps) {
  const router = useRouter();
  const { reportData } = report;

    // Re-create chart data from saved report data
    const totalFaturamentoForPercent = Object.values(reportData.totalsByGroup).reduce((sum, v) => sum + v, 0);
    const faturamentoByGroupData = Object.entries(reportData.totalsByGroup)
        .map(([name, value]) => ({ name, value, percent: totalFaturamentoForPercent > 0 ? value / totalFaturamentoForPercent : 0, isCurrency: true }))
        .filter(d => d.value > 0);

    const salesTotalForProportion = (reportData.totalMealValue || 0) + (reportData.totalBomboniereValue || 0) + (reportData.totalDeliveryFee || 0);
    const salesProportionData = [
        { name: 'Refeições', value: reportData.totalMealValue, percent: salesTotalForProportion > 0 ? (reportData.totalMealValue || 0) / salesTotalForProportion : 0, isCurrency: true },
        { name: 'Bomboniere', value: reportData.totalBomboniereValue, percent: salesTotalForProportion > 0 ? (reportData.totalBomboniereValue || 0) / salesTotalForProportion : 0, isCurrency: true },
        { name: 'Entregas', value: reportData.totalDeliveryFee, percent: salesTotalForProportion > 0 ? (reportData.totalDeliveryFee || 0) / salesTotalForProportion : 0, isCurrency: true },
    ].filter(d => d.value > 0);
    
    const totalItemsCount = (reportData.totalMealItems || 0) + (reportData.totalBomboniereQuantity || 0);
    const itemsCountData = [
        { name: 'Refeições', value: reportData.totalMealItems, percent: totalItemsCount > 0 ? (reportData.totalMealItems || 0) / totalItemsCount : 0 },
        { name: 'Bomboniere', value: reportData.totalBomboniereQuantity, percent: totalItemsCount > 0 ? (reportData.totalBomboniereQuantity || 0) / totalItemsCount : 0 },
    ].filter(d => d.value > 0);

  const sortedItemCounts = Object.entries(reportData.itemCounts || {}).sort(([, a], [, b]) => b.total - a.total);
  const sortedBomboniereCounts = Object.entries(reportData.bomboniereItemCounts || {}).sort(([, a], [, b]) => b.totalValue - a.totalValue);


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
    <div className="container mx-auto max-w-4xl p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center border-b pb-4">
          <div>
              <h2 className="text-xl sm:text-2xl font-bold">Relatório Salvo</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">{new Date(report.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" className="text-xs" onClick={onDelete}>
                <Trash2 className="mr-2 h-3 w-3" />
                Excluir
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={onBack}>
                <ArrowLeft className="mr-2 h-3 w-3" />
                Voltar
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
                        {faturamentoByGroupData.length > 0 && renderPieChart(faturamentoByGroupData, 'Faturamento por Grupo')}
                        {salesProportionData.length > 0 && renderPieChart(salesProportionData, 'Proporção de Vendas')}
                        {itemsCountData.length > 0 && renderPieChart(itemsCountData, 'Contagem de Itens')}
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
                          {sortedItemCounts.filter(([, count]) => count.salao > 0).map(([name, count]) => (
                            <div key={`${name}-salao`} className="flex justify-between"><span>{count.salao}x {name}</span></div>
                          ))}
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1">Rua</h4>
                          {sortedItemCounts.filter(([, count]) => count.rua > 0).map(([name, count]) => (
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
                            {sortedBomboniereCounts.filter(([, data]) => data.salao_qty > 0).map(([name, data]) => (
                                <div key={`${name}-salao`} className="flex justify-between"><span>{data.salao_qty}x {name}</span></div>
                            ))}
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Rua</h4>
                            {sortedBomboniereCounts.filter(([, data]) => data.rua_qty > 0).map(([name, data]) => (
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
  );
}
