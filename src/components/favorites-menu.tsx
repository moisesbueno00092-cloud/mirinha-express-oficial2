
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Star, Trash2 } from 'lucide-react';
import type { SavedFavorite } from '@/types';
import { ScrollArea } from './ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from 'react';

interface FavoritesMenuProps {
  savedFavorites: SavedFavorite[];
  onSelect: (favorite: SavedFavorite) => void;
  onDelete: (id: string) => void;
}

export default function FavoritesMenu({ savedFavorites, onSelect, onDelete }: FavoritesMenuProps) {
  const [favoriteToDelete, setFavoriteToDelete] = useState<SavedFavorite | null>(null);

  const handleDeleteRequest = (e: React.MouseEvent, favorite: SavedFavorite) => {
    e.stopPropagation();
    e.preventDefault();
    setFavoriteToDelete(favorite);
  }

  const confirmDelete = () => {
    if (favoriteToDelete) {
        onDelete(favoriteToDelete.id);
        setFavoriteToDelete(null);
    }
  }

  if (savedFavorites.length === 0) {
    return null;
  }

  return (
    <>
      <AlertDialog open={!!favoriteToDelete} onOpenChange={(open) => !open && setFavoriteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Favorito?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja remover "{favoriteToDelete?.name}" dos seus favoritos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-12 sm:w-12 text-yellow-400 hover:text-yellow-500">
            <Star className="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Star className="h-4 w-4 text-muted-foreground" />
            <span>Lançamentos Guardados</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ScrollArea className="h-[200px]">
            {savedFavorites.map((favorite) => (
              <DropdownMenuItem key={favorite.id} onSelect={() => onSelect(favorite)} className="justify-between">
                <div className="flex flex-col w-full overflow-hidden">
                  <span className="font-semibold">{favorite.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {favorite.command}
                  </span>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => handleDeleteRequest(e, favorite)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
