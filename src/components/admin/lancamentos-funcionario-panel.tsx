
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { Funcionario, FuncionarioLancamentoFinanceiro } from '@/types';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, PlusCircle, ChevronsRight, Receipt } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const lancamentoSchema = z.object({
  funcionarioId: z.string().min(1, "Selecione um funcionário."),
  tipo: z.enum(['vale', 'bonus', 'desconto', 'hora_extra', 'comissao', 'falta'], {
    required_error: "Selecione o tipo de lançamento.",
  }),
  valorOuQtd: z.preprocess(
      (val) => String(val).replace('.', '').replace(',', '.'),
      z.string().refine((val) => !isNaN(parseFloat(val)), "Valor ou quantidade inválida.")
          .transform(Number)
          .refine((val) => val > 0, "O valor ou quantidade deve ser positivo.")
  ),
  descricao: z.string().optional(),
});

type LancamentoSchemaType = z.infer<typeof lancamentoSchema>;

const LancamentosList = ({ lancamentos }: { lancamentos: FuncionarioLancamentoFinanceiro[] }) => {
    
    const tipoLancamentoStyle: Record<FuncionarioLancamentoFinanceiro['tipo'], {label: string, className: string}> = {
        'vale': { label: 'Vale', className: 'bg-yellow-500 text-black' },
        'bonus': { label: 'Bônus', className: 'bg-green-500' },
        'desconto': { label: 'Desconto', className: 'bg-red-500' },
        'hora_extra': { label: 'Hora Extra', className: 'bg-blue-500' },
        'comissao': { label: 'Comissão', className: 'bg-purple-500' },
        'falta': { label: 'Falta', className: 'bg-gray-600' },
    }

    if (lancamentos.length === 0) {
        return <div className="text-center text-muted-foreground p-8"><Receipt className="mx-auto h-8 w-8 mb-2" />Nenhum lançamento encontrado para este colaborador.</div>;
    }
    
    return (
        <div className="rounded-md border mt-4">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {lancamentos.map((lanc) => (
                    <TableRow key={lanc.id}>
                        <TableCell>{formatDateFn(new Date(lanc.data), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                            <Badge className={cn(tipoLancamentoStyle[lanc.tipo]?.className, 'text-white')}>{tipoLancamentoStyle[lanc.tipo]?.label || lanc.tipo}</Badge>
                        </TableCell>
                         <TableCell className="text-muted-foreground text-xs">{lanc.descricao || '-'}</TableCell>
                        <TableCell className={cn("text-right font-mono font-semibold", ['bonus', 'hora_extra', 'comissao'].includes(lanc.tipo) ? 'text-green-500' : 'text-red-500')}>
                            {['bonus', 'hora_extra', 'comissao'].includes(lanc.tipo) ? '+' : '-'} {formatCurrency(lanc.valor)}
                        </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </div>
    )
}

interface LancamentosFuncionarioPanelProps {
    funcionarios: Funcionario[];
    selectedFuncionarioId: string | null;
    onSelectFuncionario: (id: string | null) => void;
}

export default function LancamentosFuncionarioPanel({ funcionarios, selectedFuncionarioId, onSelectFuncionario }: LancamentosFuncionarioPanelProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const form = useForm<LancamentoSchemaType>({
      resolver: zodResolver(lancamentoSchema),
      defaultValues: {
        funcionarioId: selectedFuncionarioId || undefined,
        tipo: undefined,
        valorOuQtd: 0,
        descricao: '',
      },
    });

    const tipoLancamento = form.watch('tipo');
    
    useEffect(() => {
        form.setValue('funcionarioId', selectedFuncionarioId || '');
    }, [selectedFuncionarioId, form]);

    const lancamentosQuery = useMemoFirebase(
        () => firestore && selectedFuncionarioId ? 
            query(collection(firestore, 'funcionarios', selectedFuncionarioId, 'lancamentos'), orderBy('data', 'desc')) 
            : null,
        [firestore, selectedFuncionarioId]
    );

    const { data: lancamentos, isLoading: isLoadingLancamentos } = useCollection<FuncionarioLancamentoFinanceiro>(lancamentosQuery);

    const onSubmit = async (values: LancamentoSchemaType) => {
      if (!firestore) return;
      
      const funcionario = funcionarios.find(f => f.id === values.funcionarioId);
      if (!funcionario) {
          toast({ variant: 'destructive', title: "Erro", description: "Funcionário não encontrado." });
          return;
      }

      let valorFinal = 0;
      const quantidade = values.valorOuQtd;
      
      switch (values.tipo) {
          case 'hora_extra':
              const valorHora = funcionario.salarioBase / 220; // Assume 220h/mês
              valorFinal = quantidade * valorHora * 1.5; // Acréscimo de 50%
              break;
          case 'falta':
              const valorDia = funcionario.salarioBase / 30; // Assume 30 dias/mês
              valorFinal = quantidade * valorDia;
              break;
          default: // vale, bonus, desconto, comissao
              valorFinal = quantidade; // Nesses casos, o input é o valor monetário direto
              break;
      }

      const novoLancamento: Omit<FuncionarioLancamentoFinanceiro, 'id'> = {
        funcionarioId: values.funcionarioId,
        tipo: values.tipo,
        valor: valorFinal,
        data: new Date().toISOString(),
        descricao: values.descricao,
        ...(values.tipo === 'hora_extra' || values.tipo === 'falta' ? { quantidade: values.valorOuQtd } : {})
      };

      try {
        const lancamentosCollectionRef = collection(firestore, 'funcionarios', values.funcionarioId, 'lancamentos');
        await addDocumentNonBlocking(lancamentosCollectionRef, novoLancamento as any);
        toast({ title: "Sucesso!", description: `Lançamento para ${funcionario.nome} registado.` });
        form.reset({
            funcionarioId: values.funcionarioId,
            tipo: undefined,
            valorOuQtd: 0,
            descricao: ''
        });
      } catch (error) {
        console.error("Erro ao registar lançamento: ", error);
        toast({ variant: 'destructive', title: "Erro", description: "Não foi possível registar o lançamento." });
      }
    };
    
    const selectedFuncionario = useMemo(() => {
        if (!selectedFuncionarioId) return null;
        return funcionarios.find(f => f.id === selectedFuncionarioId);
    }, [selectedFuncionarioId, funcionarios]);

    const getValorLabel = () => {
        switch(tipoLancamento) {
            case 'hora_extra': return 'Quantidade de Horas';
            case 'falta': return 'Quantidade de Dias';
            default: return 'Valor (R$)';
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gestão Financeira de Pessoal</CardTitle>
                <CardDescription>Registe vales, bónus e outros lançamentos financeiros para os colaboradores.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-8">
                <div className="space-y-4">
                     <h3 className="text-lg font-medium">Lançamento Rápido</h3>
                     <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="funcionarioId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Colaborador</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione um colaborador" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {funcionarios.map(f => (
                                                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="tipo"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tipo de Lançamento</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione o tipo" />
                                                </Trigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="vale">Vale (Adiantamento)</SelectItem>
                                                <SelectItem value="bonus">Bónus</SelectItem>
                                                <SelectItem value="comissao">Comissão</SelectItem>
                                                <SelectItem value="desconto">Desconto</SelectItem>
                                                <SelectItem value="hora_extra">Hora Extra</SelectItem>
                                                <SelectItem value="falta">Falta (em dias)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="valorOuQtd"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>{getValorLabel()}</FormLabel>
                                    <FormControl>
                                        <Input placeholder="0,00" {...field} onChange={e => field.onChange(e.target.value.replace(/[^0-9,]/g, ''))}/>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="descricao"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Descrição (Opcional)</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Ex: Adiantamento para despesa pessoal" {...field}/>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex justify-end pt-2">
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                                    Registar Lançamento
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>
                <div className="border-l border-border pl-8">
                     <CardTitle className="flex items-center gap-2">
                         <ChevronsRight className="h-5 w-5 text-muted-foreground"/>
                         Histórico de Lançamentos
                     </CardTitle>
                     {selectedFuncionario ? (
                        <CardDescription className="mt-2">
                            A exibir lançamentos para <span className="font-semibold text-primary">{selectedFuncionario.nome}</span>.
                        </CardDescription>
                     ) : (
                        <CardDescription className="mt-2">
                            Selecione um colaborador na lista para ver o seu histórico.
                        </CardDescription>
                     )}
                    
                     {isLoadingLancamentos ? (
                         <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
                     ) : (
                        <LancamentosList lancamentos={lancamentos || []} />
                     )}
                </div>
            </CardContent>
        </Card>
    );
}
