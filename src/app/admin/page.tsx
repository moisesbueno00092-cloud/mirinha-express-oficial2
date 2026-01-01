
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Box, HandCoins, Users, Construction } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import HelpSheet from '@/components/help-sheet';

import MercadoriasPanel from '@/components/admin/mercadorias-panel';
import ContasAPagarPanel from '@/components/admin/contas-a-pagar-panel';
import FuncionariosPanel from '@/components/admin/funcionarios-panel';


export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('mercadorias');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isFuncionariosUnlocked, setIsFuncionariosUnlocked] = useState(false);
  const { toast } = useToast();

  const handleTabChange = (value: string) => {
    if (value === 'rh' && !isFuncionariosUnlocked) {
      setIsPasswordModalOpen(true);
      return;
    }
    setActiveTab(value);
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === 'jujubb3110') {
      setIsPasswordModalOpen(false);
      setIsFuncionariosUnlocked(true);
      setActiveTab('rh');
    } else {
      toast({
        variant: 'destructive',
        title: 'Senha Incorreta',
        description: 'A senha para aceder a esta funcionalidade está incorreta.',
      });
    }
  };

  return (
    <>
      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso Restrito</DialogTitle>
            <DialogDescription>
              Por favor, insira a senha para aceder à gestão de funcionários.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password-rh" className="text-right">
                Senha
              </Label>
              <Input
                id="password-rh"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePasswordSubmit();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancelar</Button>
            <Button onClick={handlePasswordSubmit}>Aceder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto max-w-7xl p-2 sm:p-4 lg:p-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Gestão Administrativa</h1>
              <p className="text-muted-foreground">Controle de mercadorias, contas e funcionários.</p>
            </div>
          </div>
          <HelpSheet />
        </header>

        <main>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="mercadorias" className="flex flex-col sm:flex-row gap-2 py-2">
                <Box className="h-5 w-5" />
                <span>Mercadorias</span>
              </TabsTrigger>
              <TabsTrigger value="financeiro" className="flex flex-col sm:flex-row gap-2 py-2">
                <HandCoins className="h-5 w-5" />
                <span>Financeiro e Histórico</span>
              </TabsTrigger>
              <TabsTrigger value="rh" className="flex flex-col sm:flex-row gap-2 py-2">
                <Users className="h-5 w-5" />
                <span>Funcionários</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="mercadorias" forceMount>
              <Card className={activeTab === 'mercadorias' ? 'block' : 'hidden'}>
                <CardHeader>
                  <CardTitle>Entrada de Mercadorias</CardTitle>
                  <CardDescription>Registe novas mercadorias e o sistema criará a conta a pagar associada.</CardDescription>
                </CardHeader>
                <CardContent>
                  <MercadoriasPanel />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="financeiro" forceMount>
              <Card className={activeTab === 'financeiro' ? 'block' : 'hidden'}>
                <CardHeader>
                  <CardTitle>Financeiro e Histórico de Preços</CardTitle>
                  <CardDescription>Controle as suas contas a pagar e consulte o histórico de compras.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ContasAPagarPanel />
                </CardContent>
              </Card>
            </TabsContent>
             <TabsContent value="rh" forceMount>
              <Card className={activeTab === 'rh' ? 'block' : 'hidden'}>
                <CardHeader>
                  <CardTitle>Recursos Humanos</CardTitle>
                  <CardDescription>Gira a sua equipa de funcionários.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isFuncionariosUnlocked ? (
                    <FuncionariosPanel />
                  ) : <div className="text-center text-muted-foreground p-8">Acesso restrito.</div>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
}
