
'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useUser } from "@/firebase";
import PasswordDialog from "@/components/password-dialog";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldX } from 'lucide-react';


function ReportsLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
    const { isUserLoading } = useUser();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthChecked, setIsAuthChecked] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (typeof window !== 'undefined') {
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
        }
    }, []);

    const handleAuthSuccess = () => {
        try {
            sessionStorage.setItem('admin-authenticated', 'true');
        } catch (e) {
            console.error("Could not write to sessionStorage:", e);
        }
        setIsAuthenticated(true);
    };

    if (isUserLoading || !isAuthChecked) {
        return (
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
                    onCancel={() => router.push('/')}
                />
            </div>
          </div>
        )
    }

    return (
        <div className="container mx-auto max-w-5xl p-2 sm:p-4 lg:p-8">
            <header className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/" passHref>
                  <Button variant="outline" size="icon">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatórios de Vendas</h1>
                  <p className="text-muted-foreground">Análise de vendas, histórico e relatórios de clientes.</p>
                </div>
              </div>
            </header>
            <main>
                {children}
            </main>
        </div>
    );
}

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
    return <ReportsLayoutContent>{children}</ReportsLayoutContent>;
}
