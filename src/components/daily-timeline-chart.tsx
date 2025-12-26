'use client';

import { useMemo } from 'react';
import type { Item } from '@/types';
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface DailyTimelineChartProps {
  items: Item[];
  dataType: 'total' | 'quantity';
  title: string;
}

const START_HOUR = 10;
const END_HOUR = 15;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatQuantity = (value: number) => {
    return String(Math.round(value));
}

const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export default function DailyTimelineChart({ items, dataType, title }: DailyTimelineChartProps) {
  const chartData = useMemo(() => {
    if (!items) return [];

    const intervals: { [key: string]: number } = {};
    const today = new Date(items[0]?.timestamp || new Date());
    const startDate = new Date(today);
    startDate.setHours(START_HOUR, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setHours(END_HOUR, 0, 0, 0);

    // Initialize all 15-minute intervals with 0
    for (let i = START_HOUR; i < END_HOUR; i++) {
      for (let j = 0; j < 60; j += 15) {
        const timeKey = `${String(i).padStart(2, '0')}:${String(j).padStart(2, '0')}`;
        intervals[timeKey] = 0;
      }
    }
    intervals[`${END_HOUR}:00`] = 0;

    // Aggregate item data into intervals
    items.forEach(item => {
      try {
        const date = new Date(item.timestamp);
        const hour = date.getHours();
        const minute = date.getMinutes();

        if (hour >= START_HOUR && hour < END_HOUR) {
          const intervalMinute = Math.floor(minute / 15) * 15;
          const timeKey = `${String(hour).padStart(2, '0')}:${String(intervalMinute).padStart(2, '0')}`;
          
          const valueToAdd = dataType === 'total' ? item.total : item.quantity;
          intervals[timeKey] = (intervals[timeKey] || 0) + valueToAdd;
        }
      } catch (e) {
        // Ignore invalid timestamps
      }
    });

    // Convert to recharts format
    return Object.entries(intervals)
      .map(([time, value]) => ({ time, value }))
      .sort((a, b) => a.time.localeCompare(b.time));

  }, [items, dataType]);

  const formatter = dataType === 'total' ? formatCurrency : formatQuantity;
  const yAxisWidth = dataType === 'total' ? 80 : 40;

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 text-center">
        {title}
      </h3>
      <ChartContainer
        config={{
          value: {
            label: dataType === 'total' ? 'Total' : 'Quantidade',
            color: 'hsl(var(--primary))',
          },
        }}
        className="h-40 w-full"
      >
        <ResponsiveContainer>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: -10 }}>
            <defs>
              <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                if(value.endsWith(':00')) {
                   return value.split(':')[0] + 'h';
                }
                return '';
              }}
              padding={{left: 10, right: 10}}
              interval="preserveStartEnd"
            />
             <YAxis 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatter(value as number)}
                width={yAxisWidth}
             />
            <ChartTooltip
              cursor={true}
              content={
                <ChartTooltipContent
                  formatter={(value, name, props) => (
                    <div>
                      <p className="font-bold">{formatter(value as number)}</p>
                      <p className="text-xs text-muted-foreground">
                        {props.payload.time}
                      </p>
                    </div>
                  )}
                  hideLabel
                  hideIndicator
                />
              }
            />
            <Area
              dataKey="value"
              type="monotone"
              fill="url(#fillValue)"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
