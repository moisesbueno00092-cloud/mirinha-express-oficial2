

'use client';

import { DailyReport, Group } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface HistoryReportDetailProps {
  report: DailyReport;
  onBack: () => void;
  onDelete: () => void;
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
    'Vendas salão': 'hsl(var(--chart-1))',
    'Fiados salão': 'hsl(var(--destructive))',
    'Vendas rua': 'hsl(var(--chart-2))',
    'Fiados rua': 'hsl(var(--chart-5))',
    'Refeições': 'hsl(var(--chart-1))',
    'Bomboniere': 'hsl(var(--chart-2))',
    'Entregas': 'hsl(var(--chart-3))',
};

export default function HistoryReportDetail({ report, onBack, onDelete }: HistoryReportDetailProps) {
  const { reportData } = report;

    // Re-create chart data from saved report data
    const totalFaturamentoForPercent = Object.values(reportData.totalsByGroup).reduce((sum, v) => sum + v, 0);
    const faturamentoByGroupData = Object.entries(reportData.totalsByGroup)
        .map(([name, value]) => ({ name, value, percent: totalFaturamentoForPercent > 0 ? value / totalFaturamentoForPercent : 0, isCurrency: true }))
        .filter(d => d.value > 0);

    const salesTotalForProportion = (reportData.totalMealValue || 0) + (reportData.totalBomboniereValue || 0) + (reportData.totalDeliveryFee || 0);
    const salesProportionData = [
        { name: 'Refeições', value: reportData.totalMealValue, percent: salesTotalForProportion > 0 ? reportData.totalMealValue / salesTotalForProportion : 0, isCurrency: true },
        { name: 'Bomboniere', value: reportData.totalBomboniereValue, percent: salesTotalForProportion > 0 ? reportData.totalBomboniereValue / salesTotalForProportion : 0, isCurrency: true },
        { name: 'Entregas', value: reportData.totalDeliveryFee, percent: salesTotalForProportion > 0 ? reportData.totalDeliveryFee / salesTotalForProportion : 0, isCurrency: true },
    ].filter(d => d.value > 0);
    
    const totalItemsCount = (reportData.totalMealItems || 0) + (reportData.totalBomboniereQuantity || 0);
    const itemsCountData = [
        { name: 'Refeições', value: reportData.totalMealItems, percent: totalItemsCount > 0 ? reportData.totalMealItems / totalItemsCount : 0 },
        { name: 'Bomboniere', value: reportData.totalBomboniereQuantity, percent: totalItemsCount > 0 ? reportData.totalBomboniereQuantity / totalItemsCount : 0 },
    ].filter(d => d.value > 0);


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
    <div className="container mx-auto max-w-4xl p-2 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-wrap gap-2 justify-between items-center">
            <div>
                <h2 className="text-xl sm:text-2xl font-bold">Relatório Salvo</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">{new Date(report.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" onClick={onDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
              </Button>
              <Button variant="outline" size="sm" onClick={onBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
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
                        {Object.entries(reportData.totalsByGroup).map(([group, total]) => (
                             <div key={group} className={`flex justify-between ${(group.includes('Fiados')) ? 'text-destructive' : ''}`}>
                                <span>{group}:</span>
                                <span className="font-mono font-medium">{formatCurrency(total)}</span>
                            </div>
                        ))}
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
                  {faturamentoByGroupData.length > 0 && renderPieChart(faturamentoByGroupData, 'Faturamento por Grupo')}
                  {salesProportionData.length > 0 && renderPieChart(salesProportionData, 'Proporção de Vendas')}
                  {itemsCountData.length > 0 && renderPieChart(itemsCountData, 'Contagem de Itens')}
                </div>
            </CardContent>
        </Card>
        
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
                            {Object.entries(reportData.itemCounts).map(([name, count]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{name}:</span>
                                        <span className="font-mono">{count.total}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1">
                            {Object.entries(reportData.itemCounts).filter(([, count]) => count.salao > 0).map(([name, count]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{name}:</span>
                                        <span className="font-mono">{count.salao}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1">
                            {Object.entries(reportData.itemCounts).filter(([, count]) => count.rua > 0).map(([name, count]) => (
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
                            {Object.entries(reportData.bomboniereItemCounts).map(([name, data]) => (
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
                            {Object.entries(reportData.bomboniereItemCounts).filter(([, data]) => data.salao > 0).map(([name, data]) => (
                                <li key={name} className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{data.salao}x</span>
                                        <span>{name}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1">
                            {Object.entries(reportData.bomboniereItemCounts).filter(([, data]) => data.rua > 0).map(([name, data]) => (
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
    </div>
  );
}
