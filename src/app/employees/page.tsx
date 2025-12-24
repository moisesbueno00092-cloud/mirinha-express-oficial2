
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, doc, orderBy, onSnapshot, Unsubscribe } from 'firebase/firestore';
import type { Employee, EmployeeAdvance } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Trash2, Plus, UserPlus, HandCoins } from 'lucide-react';
import Link from 'next/link';
import { addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

export default function EmployeesPage() {
    const firestore = useFirestore();
    const { user, isUserLoading } = useUser();
    const { toast } = useToast();

    const [isAddEmployeeDialogOpen, setIsAddEmployeeDialogOpen] = useState(false);
    const [isAddAdvanceDialogOpen, setIsAddAdvanceDialogOpen] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
    
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [advanceAmount, setAdvanceAmount] = useState('');

    const [newEmployee, setNewEmployee] = useState({ name: '', role: '', salary: '' });

    const employeesQuery = useMemoFirebase(
        () => (firestore && user ? query(collection(firestore, 'employees'), where('userId', '==', user.uid), orderBy('name', 'asc')) : null),
        [firestore, user]
    );
    const { data: employees, isLoading: isLoadingEmployees } = useCollection<Employee>(employeesQuery);

    const handleAddEmployee = () => {
        if (!firestore || !user || !newEmployee.name || !newEmployee.role || !newEmployee.salary) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Por favor, preencha todos os campos.' });
            return;
        }

        const salary = parseFloat(newEmployee.salary.replace(',', '.'));
        if (isNaN(salary)) {
            toast({ variant: 'destructive', title: 'Erro', description: 'O salário deve ser um número válido.' });
            return;
        }
        
        const employeeData: Omit<Employee, 'id'> = {
            userId: user.uid,
            name: newEmployee.name,
            role: newEmployee.role,
            salary,
        };

        addDocumentNonBlocking(collection(firestore, 'employees'), employeeData);
        toast({ title: 'Sucesso!', description: `${newEmployee.name} foi adicionado como funcionário.` });

        setIsAddEmployeeDialogOpen(false);
        setNewEmployee({ name: '', role: '', salary: '' });
    };

    const handleDeleteEmployee = () => {
        if (!firestore || !employeeToDelete) return;
        
        deleteDocumentNonBlocking(doc(firestore, 'employees', employeeToDelete.id));
        toast({ title: 'Funcionário Removido', description: `${employeeToDelete.name} foi removido.` });
        setEmployeeToDelete(null);
    }
    
    const handleAddAdvance = () => {
        if (!firestore || !selectedEmployee || !advanceAmount) {
             toast({ variant: 'destructive', title: 'Erro', description: 'Valor do vale inválido.' });
            return;
        }
        const amount = parseFloat(advanceAmount.replace(',', '.'));
        if (isNaN(amount)) {
            toast({ variant: 'destructive', title: 'Erro', description: 'O valor do vale deve ser um número.' });
            return;
        }

        const advanceData: Omit<EmployeeAdvance, 'id'> = {
            employeeId: selectedEmployee.id,
            employeeName: selectedEmployee.name,
            amount,
            date: new Date().toISOString(),
        };
        
        addDocumentNonBlocking(collection(firestore, 'employees', selectedEmployee.id, 'advances'), advanceData);
        toast({ title: 'Vale Adicionado', description: `Um vale de ${formatCurrency(amount)} foi registrado para ${selectedEmployee.name}.` });

        setIsAddAdvanceDialogOpen(false);
        setAdvanceAmount('');
        setSelectedEmployee(null);
    };

    if (isUserLoading || isLoadingEmployees) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            {/* Add Employee Dialog */}
            <Dialog open={isAddEmployeeDialogOpen} onOpenChange={setIsAddEmployeeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Adicionar Novo Funcionário</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Nome</Label>
                            <Input id="name" value={newEmployee.name} onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value })} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="role" className="text-right">Cargo</Label>
                            <Input id="role" value={newEmployee.role} onChange={(e) => setNewEmployee({...newEmployee, role: e.target.value })} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="salary" className="text-right">Salário</Label>
                            <Input id="salary" placeholder="ex: 1500.00" value={newEmployee.salary} onChange={(e) => setNewEmployee({...newEmployee, salary: e.target.value })} className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                        <Button onClick={handleAddEmployee}>Salvar Funcionário</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* Add Advance Dialog */}
            <Dialog open={isAddAdvanceDialogOpen} onOpenChange={setIsAddAdvanceDialogOpen}>
                 <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Adicionar Vale para {selectedEmployee?.name}</DialogTitle>
                        <DialogDescription>
                            O vale será registrado na data de hoje: {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="advance" className="text-right">Valor</Label>
                            <Input id="advance" placeholder="ex: 200.50" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className="col-span-3" autoFocus />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                        <Button onClick={handleAddAdvance}>Registrar Vale</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!employeeToDelete} onOpenChange={(open) => !open && setEmployeeToDelete(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Isso excluirá permanentemente {employeeToDelete?.name} e todos os seus vales registrados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteEmployee}>Confirmar e Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="container mx-auto max-w-2xl p-4 sm:p-8">
                <header className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold">Gestão de Funcionários</h1>
                        <p className="text-muted-foreground">Adicione, remova e gerencie os vales dos funcionários.</p>
                    </div>
                    <Link href="/" passHref>
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Voltar
                        </Button>
                    </Link>
                </header>

                <div className="mb-6">
                    <Button onClick={() => setIsAddEmployeeDialogOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Adicionar Funcionário
                    </Button>
                </div>
                
                <div className="space-y-4">
                    {employees && employees.length > 0 ? (
                        employees.map(employee => (
                            <Card key={employee.id}>
                                <CardHeader className="flex flex-row items-start justify-between">
                                    <div>
                                        <CardTitle>{employee.name}</CardTitle>
                                        <CardDescription>{employee.role}</CardDescription>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setEmployeeToDelete(employee)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">Salário: <span className="font-semibold text-foreground">{formatCurrency(employee.salary)}</span></p>
                                </CardContent>
                                <CardFooter>
                                    <Button variant="secondary" size="sm" onClick={() => {
                                        setSelectedEmployee(employee);
                                        setIsAddAdvanceDialogOpen(true);
                                    }}>
                                        <HandCoins className="mr-2 h-4 w-4" />
                                        Adicionar Vale
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-16 border-2 border-dashed rounded-lg">
                            <p>Nenhum funcionário cadastrado.</p>
                            <p className="text-sm">Comece adicionando um novo funcionário.</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

