"use client"

import * as React from "react"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface DatePickerProps {
    date: Date | undefined;
    setDate: (date: Date | undefined) => void;
}

export function DatePicker({ date, setDate }: DatePickerProps) {

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value; // Returns "YYYY-MM-DD"
    if (dateValue) {
      // The input value is in "YYYY-MM-DD", which the Date constructor parses correctly in UTC.
      // To avoid timezone shifts, we construct the date this way.
      const [year, month, day] = dateValue.split('-').map(Number);
      const newDate = new Date(year, month - 1, day);
      setDate(newDate);
    } else {
      setDate(undefined);
    }
  };

  const formattedDate = date ? format(date, "yyyy-MM-dd") : "";

  return (
    <div className="relative">
       <Input
        type="date"
        value={formattedDate}
        onChange={handleDateChange}
        className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
        )}
      />
    </div>
  )
}
