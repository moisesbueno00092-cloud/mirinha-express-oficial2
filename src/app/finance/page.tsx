
'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function FinancePage() {
  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Finanças</h1>
        <Link href="/" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Conteúdo Removido</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Esta secção foi removida conforme solicitado.</p>
        </CardContent>
      </Card>
    </div>
  );
}
