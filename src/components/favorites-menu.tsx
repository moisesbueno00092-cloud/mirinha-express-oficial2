
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import type { FavoriteClient } from "@/types";

interface FavoritesMenuProps {
  favoriteClients: FavoriteClient[];
  onSelectClient: (client: FavoriteClient) => void;
}

export default function FavoritesMenu({ favoriteClients, onSelectClient }: FavoritesMenuProps) {
  // Always return null to effectively hide and "clear" the favorites from the UI.
  return null;
}
