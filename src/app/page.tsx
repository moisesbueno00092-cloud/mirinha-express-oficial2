
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wrench, History, Loader2, PieChart, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import MirinhaLogo from '@/components/mirinha-logo';
import { useUser } from '@/firebase';

function DashboardPage() {
    const router = useRouter();

  return (
    <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center">
        <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary mx-auto" />
        <p className="text-muted-foreground -mt-2 text-sm sm:text-base">
          Bem-vindo ao seu painel de controlo
        </p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover:border-primary/50 transition-colors">
            <Link href="/lancador" passHref>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <PieChart className="h-6 w-6 text-primary" />
                        Lançador de Pedidos
                    </CardTitle>
                    <CardDescription>
                        Registe novos pedidos de lanches e itens da bomboniere de forma rápida e eficiente.
                    </CardDescription>
                </CardHeader>
                 <CardContent>
                     <Button className="w-full">Aceder ao Lançador</Button>
                </CardContent>
            </Link>
        </Card>
        
        <Card className="hover:border-primary/50 transition-colors">
            <Link href="/reports" passHref>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <History className="h-6 w-6 text-primary" />
                        Relatórios de Vendas
                    </CardTitle>
                    <CardDescription>
                        Consulte o histórico de vendas, relatórios diários e agregados para análise financeira.
                    </CardDescription>
                </CardHeader>
                 <CardContent>
                     <Button className="w-full" variant="outline">Ver Relatórios</Button>
                </CardContent>
            </Link>
        </Card>

        <Card className="md:col-span-2 hover:border-primary/50 transition-colors">
            <Link href="/admin" passHref>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <Wrench className="h-6 w-6 text-primary" />
                        Gestão Administrativa
                    </CardTitle>
                    <CardDescription>
                        Aceda ao painel completo para gestão de mercadorias, contas a pagar e recursos humanos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button className="w-full" variant="outline">Ir para Administração</Button>
                </CardContent>
            </Link>
        </Card>

         <Card className="md:col-span-2 bg-blue-900/20 border-blue-500/30">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-400">
                    <Info className="h-5 w-5" />
                    Um Novo Começo
                </CardTitle>
                <CardDescription className="text-blue-400/80">
                    Esta página foi simplificada para resolver os problemas anteriores. O antigo lançador de itens foi movido para a sua própria página, <Link href="/lancador" className="underline font-semibold">/lancador</Link>, para garantir estabilidade.
                </CardDescription>
            </CardHeader>
        </Card>
      </main>
    </div>
  );
}


function AuthWall({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading, userError } = useUser();
  
  const isReady = !isUserLoading && user && user.isAnonymous;

  if (!isReady) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center text-center p-4">
        <MirinhaLogo className="w-64 sm:w-80 h-auto text-primary mb-4" />
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">A aguardar autenticação...</p>
        {userError && (
            <>
                <p className="mt-4 text-destructive font-semibold">Erro de Autenticação</p>
                <p className="mt-2 text-muted-foreground text-sm max-w-md">{userError.message}</p>
            </>
        )}
      </div>
    );
  }
  
  return <>{children}</>;
}


export default function Home() {
  return (
    <AuthWall>
      <DashboardPage />
    </AuthWall>
  );
}
