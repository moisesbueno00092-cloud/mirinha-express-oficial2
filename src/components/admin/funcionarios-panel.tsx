'use client';

import { useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { Funcionario } from '@/types';
import { format as formatDateFn } from 'date-fns';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, UserPlus, Users } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import LancamentosFuncionarioPanel from './lancamentos-funcionario-panel';
import { Separator } from '../ui/separator';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const funcionarioSchema = z.object({
  nome: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
  cargo: z.string().min(3, "O cargo deve ter pelo menos 3 caracteres."),
  salarioBase: z.preprocess(
      (val) => String(val).replace('.', '').replace(',', '.'),
      z.string().refine((val) => !isNaN(parseFloat(val)), "Salário inválido.")
          .transform(Number)
          .refine((val) => val > 0, "O salário deve ser positivo.")
  ),
  dataAdmissao: z.date({
    required_error: "A data de admissão é obrigatória.",
  }),
});


const FuncionariosList = ({ funcionarios, onSelectFuncionario, selectedFuncionarioId }: { funcionarios: Funcionario[], onSelectFuncionario: (id: string | null) => void, selectedFuncionarioId: string | null }) => {
    if (funcionarios.length === 0) {
        return <div className="text-center text-muted-foreground p-8"><Users className="mx-auto h-8 w-8 mb-2" />Nenhum funcionário cadastrado.</div>;
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Colaboradores</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Cargo</TableHead>
                            <TableHead>Admissão</TableHead>
                            <TableHead className="hidden sm:table-cell">Salário Base</TableHead>
                            <TableHead className="hidden sm:table-cell">Status</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {funcionarios.map((func) => (
                            <TableRow 
                                key={func.id} 
                                className={cn("cursor-pointer", selectedFuncionarioId === func.id && "bg-accent")}
                                onClick={() => onSelectFuncionario(selectedFuncionarioId === func.id ? null : func.id)}
                            >
                                <TableCell className="font-medium">{func.nome}</TableCell>
                                <TableCell>{func.cargo}</TableCell>
                                <TableCell>{formatDateFn(new Date(func.dataAdmissao), 'dd/MM/yyyy')}</TableCell>
                                <TableCell className="hidden sm:table-cell">{formatCurrency(func.salarioBase)}</TableCell>
                                <TableCell className="hidden sm:table-cell">
                                    <Badge className={cn(func.status === 'Ativo' ? 'bg-green-500' : 'bg-red-500', 'text-white')}>{func.status}</Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export default function FuncionariosPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [selectedFuncionarioId, setSelectedFuncionarioId] = useState<string | null>(null);

    const funcionariosQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'funcionarios'), orderBy('nome', 'asc')) : null,
        [firestore]
    );

    const { data: funcionarios, isLoading: isLoadingFuncionarios } = useCollection<Funcionario>(funcionariosQuery);
    
    const form = useForm<z.infer<typeof funcionarioSchema>>({
      resolver: zodResolver(funcionarioSchema),
      defaultValues: {
        nome: "",
        cargo: "",
        salarioBase: 0,
        dataAdmissao: undefined,
      },
    });

    const onSubmit = async (values: z.infer<typeof funcionarioSchema>) => {
      if (!firestore) return;
      
      const novoFuncionario: Omit<Funcionario, 'id'> = {
        ...values,
        dataAdmissao: formatDateFn(values.dataAdmissao, 'yyyy-MM-dd'),
        status: 'Ativo',
      };

      try {
        await addDocumentNonBlocking(collection(firestore, 'funcionarios'), novoFuncionario);
        toast({ title: "Sucesso!", description: `${values.nome} foi adicionado(a) à equipa.` });
        form.reset();
      } catch (error) {
        console.error("Erro ao cadastrar funcionário: ", error);
        toast({ variant: 'destructive', title: "Erro", description: "Não foi possível cadastrar o funcionário." });
      }
    };
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Cadastro de Colaborador</CardTitle>
                    <CardDescription>Adicione um novo membro à sua equipa.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <FormField
                                control={form.control}
                                name="nome"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Nome Completo</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: João da Silva" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <FormField
                                control={form.control}
                                name="cargo"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Cargo</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Cozinheiro(a)" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <FormField
                                control={form.control}
                                name="salarioBase"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Salário Base (R$)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: 1500,00" {...field} onChange={e => field.onChange(e.target.value.replace(/[^0-9,]/g, ''))}/>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                 <FormField
                                control={form.control}
                                name="dataAdmissao"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                    <FormLabel>Data de Admissão</FormLabel>
                                    <FormControl>
                                       <DatePicker date={field.value} setDate={field.onChange} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                            </div>
                            <div className="flex justify-end pt-2">
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4" />}
                                    Cadastrar Colaborador
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            {isLoadingFuncionarios ? (
                 <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
            ) : (
                <FuncionariosList 
                    funcionarios={funcionarios || []} 
                    onSelectFuncionario={setSelectedFuncionarioId}
                    selectedFuncionarioId={selectedFuncionarioId}
                />
            )}
            
            {(selectedFuncionarioId || (funcionarios && funcionarios.length > 0)) && <Separator className="my-8" />}

            {(selectedFuncionarioId || (funcionarios && funcionarios.length > 0)) && (
                <LancamentosFuncionarioPanel
                    funcionarios={funcionarios || []}
                    selectedFuncionarioId={selectedFuncionarioId}
                    onSelectFuncionario={setSelectedFuncionarioId}
                />
            )}
        </div>
    );
}
