
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 sm:h-12 sm:w-12"
        >
          <Star className="h-5 w-5 text-amber-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Clientes Favoritos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {favoriteClients.length > 0 ? (
            favoriteClients.map(client => (
                <DropdownMenuItem key={client.id} onClick={() => onSelectClient(client)}>
                    {client.name}
                </DropdownMenuItem>
            ))
        ) : (
            <DropdownMenuItem disabled>Nenhum cliente salvo</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
