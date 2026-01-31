
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Box, HandCoins, Users, Wrench, ShieldX, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HelpSheet from '@/components/help-sheet';
import PasswordDialog from '@/components/password-dialog';

import MercadoriasPanel from '@/components/admin/mercadorias-panel';
import ContasAPagarPanel from '@/components/admin/contas-a-pagar-panel';
import FechamentoCaixaPanel from '@/components/admin/fechamento-caixa-panel';
import HistoricoFinanceiroPanel from '@/components/admin/historico-financeiro-panel';
import FuncionariosPanel from '@/components/admin/funcionarios-panel';
import { useRouter } from 'next/navigation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


function AdminPageContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('mercadorias');
  const [isRhAuthenticated, setIsRhAuthenticated] = useState(false);
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
      try {
        const sessionAuth = sessionStorage.getItem('rh-admin-authenticated');
        if (sessionAuth === 'true') {
          setIsRhAuthenticated(true);
        }
      } catch (e) {
        console.error("Could not read sessionStorage:", e);
      } finally {
        setIsAuthChecked(true);
      }
    }
  }, []);
  
  const handleTabChange = (value: string) => {
    if (value === 'rh' && !isRhAuthenticated) {
        setPasswordPromptOpen(true);
        // Don't switch tab until authenticated
        return;
    }
    setActiveTab(value);
  }

  const handleAuthSuccess = () => {
    try {
        sessionStorage.setItem('rh-admin-authenticated', 'true');
    } catch(e) {
        console.error("Could not write to sessionStorage:", e);
    }
    setIsRhAuthenticated(true);
    setActiveTab('rh'); // Switch to the tab after success
    setPasswordPromptOpen(false);
  }

  const handleAuthCancel = () => {
    setPasswordPromptOpen(false);
    // Don't switch tab, stay on the current one
  }

  return (
    <>
       <PasswordDialog 
            open={passwordPromptOpen}
            onOpenChange={setPasswordPromptOpen}
            onSuccess={handleAuthSuccess}
            onCancel={handleAuthCancel}
            showCancel={true}
        />
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
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="mercadorias" className="flex flex-col sm:flex-row gap-2 py-2">
                <Box className="h-5 w-5" />
                <span>Mercadorias</span>
              </TabsTrigger>
              <TabsTrigger value="financeiro" className="flex flex-col sm:flex-row gap-2 py-2">
                <HandCoins className="h-5 w-5" />
                <span>Financeiro</span>
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
            <TabsContent value="financeiro" className="space-y-4 pt-4">
              <Accordion type="multiple" className="w-full space-y-4">
                 <AccordionItem value="fechamento-caixa">
                    <Card>
                      <AccordionTrigger className="flex w-full items-center justify-between p-6 text-lg font-semibold hover:no-underline">
                        <span>Fechamento de Caixa do Dia</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-6 pt-0">
                        <CardDescription className="mb-4">Use esta ferramenta para fazer a prova real do seu caixa em dinheiro.</CardDescription>
                        <FechamentoCaixaPanel />
                      </AccordionContent>
                    </Card>
                 </AccordionItem>
                 <AccordionItem value="contas-pagar">
                    <Card>
                      <AccordionTrigger className="flex w-full items-center justify-between p-6 text-lg font-semibold hover:no-underline">
                        <span>Contas a Pagar</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-6 pt-0">
                        <CardDescription className="mb-4">Controle as suas contas pendentes e pagamentos. Clique no ícone de documento para ver o romaneio.</CardDescription>
                        <ContasAPagarPanel />
                      </AccordionContent>
                    </Card>
                 </AccordionItem>
                 <AccordionItem value="historico-compras">
                    <Card>
                      <AccordionTrigger className="flex w-full items-center justify-between p-6 text-lg font-semibold hover:no-underline">
                        <span>Histórico e Edição de Compras</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-6 pt-0">
                        <CardDescription className="mb-4">Consulte o histórico detalhado, edite ou apague entradas de mercadorias já pagas.</CardDescription>
                        <HistoricoFinanceiroPanel />
                      </AccordionContent>
                    </Card>
                 </AccordionItem>
              </Accordion>
            </TabsContent>
            <TabsContent value="rh">
               {isAuthChecked && isRhAuthenticated ? (
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
               ) : (
                 <Card>
                    <CardContent className="p-10 text-center text-muted-foreground">
                       {isAuthChecked ? (
                         <>
                            <ShieldX className="mx-auto h-12 w-12 text-destructive mb-4" />
                            <h3 className="text-lg font-semibold text-foreground">Acesso Restrito</h3>
                            <p>Este separador requer uma senha para ser visualizado.</p>
                         </>
                       ) : (
                         <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                       )}
                    </CardContent>
                 </Card>
               )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
}


export default function AdminPage() {
    return (
        <AdminPageContent />
    )
}
