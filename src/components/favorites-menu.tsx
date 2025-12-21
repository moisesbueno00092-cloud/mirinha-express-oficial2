
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Star, Trash2 } from "lucide-react";
import type { FavoriteClient } from "@/types";

interface FavoritesMenuProps {
  favoriteClients: FavoriteClient[];
  onSelectClient: (client: FavoriteClient) => void;
  onDeleteClient: (clientId: string) => void;
}

export default function FavoritesMenu({ favoriteClients, onSelectClient, onDeleteClient }: FavoritesMenuProps) {
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
          <DropdownMenuSub key={client.id}>
             <DropdownMenuSubTrigger>
              <span className="flex-1" onClick={() => onSelectClient(client)}>{client.name}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onDeleteClient(client.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Confirmar Exclusão</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
