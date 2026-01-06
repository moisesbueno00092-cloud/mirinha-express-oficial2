
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Box, HandCoins, History, Users, Wrench, BookOpen, ShieldX, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HelpSheet from '@/components/help-sheet';
import PasswordDialog from '@/components/password-dialog';

import MercadoriasPanel from '@/components/admin/mercadorias-panel';
import ContasAPagarPanel from '@/components/admin/contas-a-pagar-panel';
import HistoricoFinanceiroPanel from '@/components/admin/historico-financeiro-panel';
import FuncionariosPanel from '@/components/admin/funcionarios-panel';
import { useRouter } from 'next/navigation';


export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('mercadorias');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
    try {
      const sessionAuth = sessionStorage.getItem('admin-authenticated');
      if (sessionAuth === 'true') {
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.error("Could not read sessionStorage:", e);
    } finally {
        setIsAuthChecked(true);
    }
  }, []);

  const handleAuthSuccess = () => {
    try {
        sessionStorage.setItem('admin-authenticated', 'true');
    } catch(e) {
        console.error("Could not write to sessionStorage:", e);
    }
    setIsAuthenticated(true);
  }

  if (!isAuthChecked) {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary"/>
        </div>
    );
  }
 
   if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
            <h2 className="text-center text-2xl font-bold mb-2 flex items-center justify-center gap-2"><ShieldX className="h-7 w-7 text-destructive"/> Acesso Restrito</h2>
            <p className="text-center text-muted-foreground mb-6">Esta secção requer uma senha para aceder.</p>
            <PasswordDialog 
                open={true}
                onOpenChange={(isOpen) => { if(!isOpen) router.push('/'); }}
                onSuccess={handleAuthSuccess}
                showCancel={true}
            />
        </div>
      </div>
    )
  }

  return (
    <>
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
              <p className="text-muted-foreground">Controle de mercadorias, contas e RH.</p>
            </div>
          </div>
        </header>

        <main>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-auto">
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
               <TabsTrigger 
                  value="rh" 
                  className="flex flex-col sm:flex-row gap-2 py-2"
               >
                <Users className="h-5 w-5" />
                <span>Recursos Humanos</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="mercadorias">
              <Card>
                <CardHeader>
                  <CardTitle>Entrada de Mercadorias</CardTitle>
                  <CardDescription>Registe novas mercadorias e o sistema criará a conta a pagar associada.</CardDescription>
                </CardHeader>
                <CardContent>
                  <MercadoriasPanel />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="financeiro">
              <Card>
                <CardHeader>
                  <CardTitle>Contas a Pagar</CardTitle>
                  <CardDescription>Controle as suas contas pendentes e pagamentos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ContasAPagarPanel />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="historico">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico Financeiro</CardTitle>
                  <CardDescription>Consulte relatórios de despesas, compras e histórico de preços.</CardDescription>
                </CardHeader>
                <CardContent>
                  <HistoricoFinanceiroPanel />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="rh">
              <Card>
                <CardHeader className='flex-row items-start justify-between'>
                  <div>
                    <CardTitle>Recursos Humanos</CardTitle>
                    <CardDescription>Gestão de colaboradores, admissões e lançamentos financeiros.</CardDescription>
                  </div>
                  <HelpSheet />
                </CardHeader>
                <CardContent>
                  <FuncionariosPanel />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
}
