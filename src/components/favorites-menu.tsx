
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
import { Star, Trash2, Loader2 } from "lucide-react";
import type { FavoriteClient } from "@/types";

interface FavoritesMenuProps {
  favoriteClients: FavoriteClient[];
  onSelectClient: (client: FavoriteClient) => void;
  onDeleteClient: (clientId: string) => void;
  isLoading: boolean;
}

export default function FavoritesMenu({ favoriteClients, onSelectClient, onDeleteClient, isLoading }: FavoritesMenuProps) {

  const handleSubTriggerClick = (e: React.MouseEvent, client: FavoriteClient) => {
    // Only trigger selection when the main part of the sub-trigger is clicked
    if ((e.target as HTMLElement).closest('[data-radix-collection-item]')) {
        onSelectClient(client);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          type="button" 
          variant="outline"
          size="icon"
          className="h-10 w-10 sm:h-12 sm:w-12 shrink-0"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin"/> : <Star className="h-5 w-5 text-amber-500" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Clientes Favoritos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {favoriteClients.length === 0 ? (
            <DropdownMenuItem disabled>Nenhum favorito salvo</DropdownMenuItem>
        ) : (
            favoriteClients.map((client) => (
            <DropdownMenuSub key={client.id}>
                <DropdownMenuSubTrigger onClick={(e) => handleSubTriggerClick(e, client)}>
                    <span className="flex-1">{client.name}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                <DropdownMenuSubContent>
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => {
                            e.preventDefault(); // Prevent menu from closing
                            onDeleteClient(client.id);
                        }}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Confirmar Exclusão</span>
                    </DropdownMenuItem>
                </DropdownMenuSubContent>
                </DropdownMenuPortal>
            </DropdownMenuSub>
            ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

    