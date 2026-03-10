
"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
    date: Date | undefined;
    setDate: (date: Date | undefined) => void;
}

export function DatePicker({ date, setDate }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Função para lidar com a seleção e fechar o popover
  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    // Se uma data foi selecionada, fechamos o calendário
    if (selectedDate) {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
          locale={ptBR}
        />
      </PopoverContent>
    </Popover>
  )
}
