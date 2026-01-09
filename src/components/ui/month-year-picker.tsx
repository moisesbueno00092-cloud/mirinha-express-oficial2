
"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface MonthYearPickerProps {
    date: Date | undefined;
    setDate: (date: Date | undefined) => void;
}

export function MonthYearPicker({ date, setDate }: MonthYearPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [displayDate, setDisplayDate] = React.useState(date || new Date());

  React.useEffect(() => {
    setDisplayDate(date || new Date());
  }, [date]);

  const handleMonthChange = (month: number) => {
    const newDate = new Date(displayDate.getFullYear(), month, 1);
    setDisplayDate(newDate);
    setDate(newDate);
    setOpen(false);
  }

  const handleYearChange = (delta: number) => {
    setDisplayDate(new Date(displayDate.getFullYear() + delta, displayDate.getMonth(), 1));
  }
  
  const months = Array.from({ length: 12 }, (_, i) => ({
      value: i,
      label: format(new Date(2000, i), 'MMM', { locale: ptBR })
  }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "MMMM yyyy", { locale: ptBR }) : <span>Selecione mês/ano</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <div className="p-3">
            <div className="flex items-center justify-between pb-2">
                <Button variant="ghost" size="icon" onClick={() => handleYearChange(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="font-semibold text-sm">
                    {displayDate.getFullYear()}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleYearChange(1)}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {months.map((month) => (
                    <Button
                        key={month.value}
                        variant={date?.getMonth() === month.value && date.getFullYear() === displayDate.getFullYear() ? 'default' : 'ghost'}
                        onClick={() => handleMonthChange(month.value)}
                        className="text-xs capitalize"
                    >
                        {month.label}
                    </Button>
                ))}
            </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
