
"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, DropdownProps } from "react-day-picker"
import { ptBR } from 'date-fns/locale';

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { ScrollArea } from "./scroll-area";

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(props.month || new Date());
  
  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
    props.onMonthChange?.(month);
  };
  
  React.useEffect(() => {
    // If the month prop changes from outside, update the internal state
    if (props.month && props.month.getTime() !== currentMonth.getTime()) {
      setCurrentMonth(props.month);
    }
  }, [props.month, currentMonth]);


  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      month={currentMonth}
      onMonthChange={handleMonthChange}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium hidden",
        caption_dropdowns: "flex items-center gap-1.5",
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
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside: "day-outside text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
        Dropdown: ({ value, onChange, children, ...props }: DropdownProps) => {
          const options = React.Children.toArray(
            children
          ) as React.ReactElement<React.HTMLProps<HTMLOptionElement>>[];

          const currentYear = new Date().getFullYear();
          const fromYear = props.fromYear || currentYear - 100;
          const toYear = props.toYear || currentYear;
          const years = [];
          for (let i = toYear; i >= fromYear; i--) {
            years.push(i);
          }

          const selectedMonth = currentMonth.getMonth();
          const selectedYear = currentMonth.getFullYear();

          const handleMonthSelect = (month: string) => {
            const newDate = new Date(currentMonth);
            newDate.setMonth(parseInt(month, 10));
            handleMonthChange(newDate);
          }

          const handleYearSelect = (year: string) => {
            const newDate = new Date(currentMonth);
            newDate.setFullYear(parseInt(year, 10));
            handleMonthChange(newDate);
          }

          return (
            <div className="flex gap-1.5">
              <Select
                value={String(selectedMonth)}
                onValueChange={handleMonthSelect}
              >
                <SelectTrigger className="h-7 w-auto min-w-[7rem] px-2 text-xs focus:ring-0">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  {options.map((option, id: number) => (
                    <SelectItem
                      key={`${option.props.value}-${id}`}
                      value={String(option.props.value)}
                    >
                      {option.props.children}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(selectedYear)}
                onValueChange={handleYearSelect}
              >
                <SelectTrigger className="h-7 w-[4.5rem] px-2 text-xs focus:ring-0">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                    <ScrollArea className="h-72">
                        {years.map((year) => (
                            <SelectItem key={year} value={String(year)}>
                            {year}
                            </SelectItem>
                        ))}
                    </ScrollArea>
                </SelectContent>
              </Select>
            </div>
          )
        }
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
