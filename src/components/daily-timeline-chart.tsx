
'use client';

import { useMemo } from 'react';
import type { Item } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { groupBadgeStyles } from '@/components/item-list';

interface DailyTimelineChartProps {
  items: Item[];
}

const START_HOUR = 10;
const END_HOUR = 15;
const DURATION_MINUTES = (END_HOUR - START_HOUR) * 60;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export default function DailyTimelineChart({ items }: DailyTimelineChartProps) {
  const timelineItems = useMemo(() => {
    if (!items) return [];

    return items
      .map(item => {
        try {
          const date = new Date(item.timestamp);
          const itemHour = date.getHours();
          const itemMinute = date.getMinutes();
          
          if (itemHour < START_HOUR || itemHour >= END_HOUR) {
            return null;
          }

          const minutesFromStart = (itemHour - START_HOUR) * 60 + itemMinute;
          const position = (minutesFromStart / DURATION_MINUTES) * 100;
          
          return {
            ...item,
            position: position,
          };
        } catch (e) {
          return null;
        }
      })
      .filter((i): i is Item & { position: number } => i !== null)
      .sort((a,b) => a.position - b.position);
  }, [items]);

  const getSegmentColor = (item: Item) => {
    if (item.group.includes('Fiado')) return 'bg-destructive';
    if (item.group.includes('rua')) return 'bg-blue-600';
    return 'bg-purple-600';
  }

  const hourMarkers = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 text-center">Linha do Tempo dos Lançamentos (10h - 15h)</h3>
      <TooltipProvider>
        <div className="relative h-4 w-full rounded-full bg-secondary">
          {timelineItems.map(item => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "absolute top-0 h-4 w-1 rounded-full",
                    getSegmentColor(item)
                  )}
                  style={{ left: `${item.position}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-bold">{formatCurrency(item.total)}</p>
                {item.customerName && <p className="text-sm text-muted-foreground">{item.customerName}</p>}
                <p className="text-xs">
                  <Badge variant="outline" className={cn("text-xs", groupBadgeStyles[item.group])}>
                    {item.group}
                  </Badge>
                  {' @ '}{new Date(item.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
      <div className="relative mt-1 flex w-full justify-between text-xs text-muted-foreground">
        {hourMarkers.map(hour => (
            <span key={hour} className="transform -translate-x-1/2">{`${hour}h`}</span>
        ))}
        <span className="transform translate-x-1/2">{`${END_HOUR}h`}</span>
      </div>
    </div>
  );
}
