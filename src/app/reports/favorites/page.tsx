
'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import FechamentoFavoritosPanel from '@/components/admin/fechamento-favoritos-panel';

export default function FavoriteClientsReportPage() {
  return (
    <div className="container mx-auto max-w-7xl p-2 sm:p-4 lg:p-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/reports" passHref>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Fecho Mensal de Clientes Favoritos</h1>
            <p className="text-muted-foreground">Consulte e liquide os saldos mensais dos seus clientes favoritos.</p>
          </div>
        </div>
      </header>
      <main>
        <FechamentoFavoritosPanel />
      </main>
    </div>
  );
}

