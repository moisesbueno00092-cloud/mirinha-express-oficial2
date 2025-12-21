
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
  if (favoriteClients.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          type="button" 
          variant="outline"
          size="icon"
          className="h-10 w-10 sm:h-12 sm:w-12 shrink-0"
        >
          <Star className="h-5 w-5 text-amber-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Clientes Favoritos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {favoriteClients.map((client) => (
          <DropdownMenuItem key={client.id} onSelect={() => onSelectClient(client)}>
            {client.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
