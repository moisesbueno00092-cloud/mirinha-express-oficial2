
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Box, HandCoins, History, Users, Wrench, BookOpen, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import HelpSheet from '@/components/help-sheet';


import MercadoriasPanel from '@/components/admin/mercadorias-panel';
import ContasAPagarPanel from '@/components/admin/contas-a-pagar-panel';
import HistoricoFinanceiroPanel from '@/components/admin/historico-financeiro-panel';
import FuncionariosPanel from '@/components/admin/funcionarios-panel';
import FechamentoFavoritosPanel from '@/components/admin/fechamento-favoritos-panel';


export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('mercadorias');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordAction, setPasswordAction] = useState<'rh' | null>(null);
  const [isRhUnlocked, setIsRhUnlocked] = useState(false);
  const { toast } = useToast();

  const handleOpenPasswordModal = (action: 'rh') => {
    if (action === 'rh' && isRhUnlocked) {
      setActiveTab('rh');
      return;
    }
    setPasswordAction(action);
    setPasswordInput('');
    setIsPasswordModalOpen(true);
  }

  const handlePasswordSubmit = () => {
    if (passwordInput === 'jujubb3110') {
        setIsPasswordModalOpen(false);
        if (passwordAction === 'rh') {
          setIsRhUnlocked(true);
          setActiveTab('rh');
        }
    } else {
        toast({
            variant: 'destructive',
            title: 'Senha Incorreta',
            description: 'A senha para aceder a esta funcionalidade está incorreta.'
        })
    }
  }
 
  return (
    <>
      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso Restrito</DialogTitle>
            <DialogDescription>
              Por favor, insira a senha para continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Senha
              </Label>
              <Input
                id="password"
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
              <p className="text-muted-foreground">Controle de mercadorias, contas, clientes e RH.</p>
            </div>
          </div>
        </header>

        <main>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-auto">
              <TabsTrigger value="mercadorias" className="flex flex-col sm:flex-row gap-2 py-2">
                <Box className="h-5 w-5" />
                <span>Mercadorias</span>
              </TabsTrigger>
              <TabsTrigger value="financeiro" className="flex flex-col sm:flex-row gap-2 py-2">
                <HandCoins className="h-5 w-5" />
                <span>Financeiro</span>
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex flex-col sm:flex-row gap-2 py-2">
                <History className="h-5 w-5" />
                <span>Histórico</span>
              </TabsTrigger>
              <TabsTrigger value="clientes" className="flex flex-col sm:flex-row gap-2 py-2">
                  <UserCheck className="h-5 w-5" />
                  <span>Clientes</span>
              </TabsTrigger>
               <TabsTrigger 
                  value="rh" 
                  className="flex flex-col sm:flex-row gap-2 py-2"
                  onClick={(e) => {
                    if (!isRhUnlocked) {
                      e.preventDefault();
                      handleOpenPasswordModal('rh');
                    }
                  }}
               >
                <Users className="h-5 w-5" />
                <span>Recursos Humanos</span>
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
                  <CardTitle>Contas a Pagar</CardTitle>
                  <CardDescription>Controle as suas contas pendentes e pagamentos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ContasAPagarPanel />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="historico" forceMount>
              <Card className={activeTab === 'historico' ? 'block' : 'hidden'}>
                <CardHeader>
                  <CardTitle>Histórico Financeiro</CardTitle>
                  <CardDescription>Consulte relatórios de despesas, compras e histórico de preços.</CardDescription>
                </CardHeader>
                <CardContent>
                  <HistoricoFinanceiroPanel />
                </CardContent>
              </Card>
            </TabsContent>
             <TabsContent value="clientes" forceMount>
              <Card className={activeTab === 'clientes' ? 'block' : 'hidden'}>
                <CardHeader>
                  <CardTitle>Fecho Mensal de Clientes Favoritos</CardTitle>
                  <CardDescription>Consulte e liquide os saldos mensais dos seus clientes favoritos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <FechamentoFavoritosPanel />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="rh" forceMount>
               <Card className={activeTab === 'rh' ? 'block' : 'hidden'}>
                <CardHeader className='flex-row items-start justify-between'>
                  <div>
                    <CardTitle>Recursos Humanos</CardTitle>
                    <CardDescription>Gestão de colaboradores, admissões e lançamentos financeiros.</CardDescription>
                  </div>
                  <HelpSheet />
                </CardHeader>
                <CardContent>
                  {isRhUnlocked ? <FuncionariosPanel /> : <p className='text-center text-muted-foreground p-8'>Acesso bloqueado. Por favor, insira a senha.</p>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
}
