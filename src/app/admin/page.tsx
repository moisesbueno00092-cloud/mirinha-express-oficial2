
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Box, Building, HandCoins, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Placeholder components for each section
const MercadoriasPanel = () => <div className="text-muted-foreground">Gestão de mercadorias em construção...</div>;
const FornecedoresPanel = () => <div className="text-muted-foreground">Gestão de fornecedores em construção...</div>;
const ContasAPagarPanel = () => <div className="text-muted-foreground">Gestão de contas a pagar em construção...</div>;
const FuncionariosPanel = () => <div className="text-muted-foreground">Gestão de funcionários em construção...</div>;

export default function AdminPage() {
  return (
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
            <p className="text-muted-foreground">Controle de mercadorias, fornecedores, contas e funcionários.</p>
          </div>
        </div>
      </header>

      <main>
        <Tabs defaultValue="mercadorias" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="mercadorias" className="flex flex-col sm:flex-row gap-2 py-2">
              <Box className="h-5 w-5" />
              <span>Mercadorias</span>
            </TabsTrigger>
            <TabsTrigger value="fornecedores" className="flex flex-col sm:flex-row gap-2 py-2">
              <Building className="h-5 w-5" />
              <span>Fornecedores</span>
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="flex flex-col sm:flex-row gap-2 py-2">
              <HandCoins className="h-5 w-5" />
              <span>Financeiro</span>
            </TabsTrigger>
            <TabsTrigger value="rh" className="flex flex-col sm:flex-row gap-2 py-2">
              <Users className="h-5 w-5" />
              <span>Funcionários</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="mercadorias">
            <Card>
              <CardHeader>
                <CardTitle>Entrada de Mercadorias</CardTitle>
                <CardDescription>Registe novas mercadorias e consulte o histórico de preços.</CardDescription>
              </CardHeader>
              <CardContent>
                <MercadoriasPanel />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="fornecedores">
            <Card>
              <CardHeader>
                <CardTitle>Fornecedores</CardTitle>
                <CardDescription>Gira o seu catálogo de fornecedores.</CardDescription>
              </CardHeader>
              <CardContent>
                <FornecedoresPanel />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="financeiro">
            <Card>
              <CardHeader>
                <CardTitle>Contas a Pagar</CardTitle>
                <CardDescription>Controle as suas contas e vencimentos.</CardDescription>
              </CardHeader>
              <CardContent>
                <ContasAPagarPanel />
              </CardContent>
            </Card>
          </TabsContent>
           <TabsContent value="rh">
            <Card>
              <CardHeader>
                <CardTitle>Recursos Humanos</CardTitle>
                <CardDescription>Gira a sua equipa de funcionários.</CardDescription>
              </CardHeader>
              <CardContent>
                <FuncionariosPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
