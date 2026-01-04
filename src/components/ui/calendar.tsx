"use client"

import * as React from "react"
import { format, parse } from "date-fns"

import { cn } from "@/lib/utils"

export type CalendarProps = {
  mode: "single"
  selected: Date | undefined
  onSelect: (date: Date | undefined) => void
  className?: string
  initialFocus?: boolean
  disabled?: (date: Date) => boolean
}

/**
 * A reliable calendar component that uses the native browser <input type="date" />.
 * This avoids all the layout and styling issues from the previous library.
 */
function Calendar({
  mode,
  selected,
  onSelect,
  className,
  ...props
}: CalendarProps) {
  if (mode !== "single") {
    // This implementation only supports single date selection
    return (
      <div className="p-3 text-destructive">
        Error: Only single date selection is supported with this calendar.
      </div>
    )
  }

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = event.target.value
    if (dateValue) {
      // The input value is in 'YYYY-MM-DD' format.
      // We parse it into a Date object.
      const newDate = parse(dateValue, "yyyy-MM-dd", new Date())
      onSelect(newDate)
    } else {
      onSelect(undefined)
    }
  }

  // Format the selected date back to 'YYYY-MM-DD' for the input value
  const value = selected ? format(selected, "yyyy-MM-dd") : ""

  return (
    <div className={cn("p-3", className)}>
      <input
        type="date"
        value={value}
        onChange={handleDateChange}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        {...props}
      />
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
