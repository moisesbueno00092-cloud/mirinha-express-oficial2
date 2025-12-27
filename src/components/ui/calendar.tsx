"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, DropdownProps } from "react-day-picker"
import { ptBR } from 'date-fns/locale';

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const handleYearChange = (newValue: string) => {
    if (props.onMonthChange && props.month) {
      const newDate = new Date(props.month);
      newDate.setFullYear(parseInt(newValue, 10));
      props.onMonthChange(newDate);
    }
  };

  const handleMonthChange = (newValue: string) => {
    if (props.onMonthChange && props.month) {
      const newDate = new Date(props.month);
      newDate.setMonth(parseInt(newValue, 10));
      props.onMonthChange(newDate);
    }
  };

  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium hidden",
        caption_dropdowns: "flex justify-center gap-2",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
        dropdown: "rdp-dropdown bg-card",
        dropdown_icon: "ml-2",
        dropdown_year: "rdp-dropdown_year ml-3",
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
        Dropdown: (dropdownProps: DropdownProps) => {
          const { fromMonth, fromDate, toMonth, toDate } = dropdownProps;
          const { fromYear, fromMonth: fromMonthVal, toYear, toMonth: toMonthVal } = dropdownProps;

          const currentYear = new Date().getFullYear();
          let selectValues = [];

          if (dropdownProps.name === 'months') {
            selectValues = Array.from({ length: 12 }, (_, i) => ({
              value: i.toString(),
              label: format(new Date(currentYear, i), 'MMMM', { locale: ptBR }),
            }));
          } else if (dropdownProps.name === 'years') {
             const earliestYear = fromYear || fromDate?.getFullYear() || currentYear - 100;
             const latestYear = toYear || toDate?.getFullYear() || currentYear + 10;
            for (let i = earliestYear; i <= latestYear; i++) {
              selectValues.push({ value: i.toString(), label: i.toString() });
            }
          }
          
          const selectedValue = dropdownProps.name === 'months' 
            ? props.month?.getMonth().toString()
            : props.month?.getFullYear().toString();


          return (
             <Select
              onValueChange={
                dropdownProps.name === "months"
                  ? handleMonthChange
                  : handleYearChange
              }
              value={selectedValue}
            >
              <SelectTrigger>
                <SelectValue placeholder={dropdownProps.name === 'months' ? 'Mês' : 'Ano'} />
              </SelectTrigger>
              <SelectContent>
                {selectValues.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
