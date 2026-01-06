'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const CORRECT_PASSWORD = '1313';

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  showCancel?: boolean;
}

export default function PasswordDialog({ open, onOpenChange, onSuccess, showCancel = true }: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
      setIsChecking(false);
    }
  }, [open]);

  const handleCheckPassword = () => {
    setIsChecking(true);
    setError('');

    setTimeout(() => {
      if (password === CORRECT_PASSWORD) {
        toast({ title: 'Acesso Autorizado', description: 'Bem-vindo(a)!' });
        onSuccess();
      } else {
        setError('Senha incorreta. Tente novamente.');
        toast({
          variant: 'destructive',
          title: 'Senha Incorreta',
          description: 'A senha que inseriu não está correta.',
        });
      }
      setIsChecking(false);
    }, 500); // Simulate network delay
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCheckPassword();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inserir Senha</DialogTitle>
          <DialogDescription>
            Para aceder a esta área, por favor insira a senha de administrador.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="text-center text-lg tracking-widest"
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
          </div>
          <DialogFooter>
            {showCancel && <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>}
            <Button type="submit" disabled={isChecking || !password}>
              {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
