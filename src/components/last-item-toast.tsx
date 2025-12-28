"use client";

import type { Item } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ToastTitle } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { groupBadgeStyles, renderItemName } from "@/components/item-list";

interface LastItemToastProps {
    item: Item;
    title: string;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

export default function LastItemToast({ item, title }: LastItemToastProps) {
    if (!item) return null;

    return (
        <div className="grid gap-2 w-full">
            <ToastTitle>{title}</ToastTitle>
            <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                <div className="flex flex-col gap-1.5">
                    {renderItemName(item)}
                    <Badge className={cn("whitespace-nowrap w-fit", groupBadgeStyles[item.group] || "bg-gray-500")}>
                        {item.group}
                    </Badge>
                </div>
                <div className="text-right">
                    <div className="font-bold text-lg text-primary">{formatCurrency(item.total)}</div>
                    {item.deliveryFee > 0 && <div className="text-xs text-muted-foreground">Taxa: {formatCurrency(item.deliveryFee)}</div>}
                </div>
            </div>
        </div>
    );
}
