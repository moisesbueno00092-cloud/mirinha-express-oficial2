
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { format, parse, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { Funcionario, FuncionarioLancamentoFinanceiro } from '@/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Loader2, Pencil, User, Briefcase, Calendar, Info, DollarSign, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';

const formatCurrency = (value: number | undefined | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
};

const LancamentoFinanceiroModal = ({
    isOpen,
    onClose,
    funcionario,
    onSave,
}: {
    isOpen: boolean;
    onClose: () => void;
    funcionario: Funcionario | null;
    onSave: (data: Omit<FuncionarioLancamentoFinanceiro, 'id' | 'funcionarioId'>) => void;
}) => {
    const firestore = useFirestore();
    const [tipo, setTipo] = useState<'vale' | 'bonus' | 'desconto'>('vale');
    const [valor, setValor] = useState('');
    const [descricao, setDescricao] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    // The query without orderBy to avoid needing a composite index in the emulator
    const lancamentosQuery = useMemoFirebase(
      () => firestore && funcionario ? query(
        collection(firestore, 'funcionario_lancamentos'), 
        where("funcionarioId", "==", funcionario.id)
      ) : null,
      [firestore, funcionario]
    );

    const { data: lancamentos, isLoading } = useCollection<FuncionarioLancamentoFinanceiro>(lancamentosQuery);

    // Sort data on the client-side
    const sortedLancamentos = useMemo(() => {
        if (!lancamentos) return [];
        return [...lancamentos].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    }, [lancamentos]);


    useEffect(() => {
        if (isOpen) {
            setTipo('vale');
            setValor('');
            setDescricao('');
        }
    }, [isOpen]);

    const handleSave = () => {
        const valorNumerico = parseFloat(valor.replace(',', '.'));
        if (!valor.trim() || isNaN(valorNumerico) || valorNumerico <= 0) {
            toast({ variant: 'destructive', title: 'Valor Inválido', description: 'Por favor, insira um valor numérico válido.'});
            return;
        }

        setIsSaving(true);
        const dataToSave = {
            mesReferencia: format(new Date(), 'yyyy-MM'),
            tipo,
            valor: valorNumerico,
            data: new Date().toISOString(),
            descricao: descricao.trim() || `Lançamento de ${tipo}`,
        };
        onSave(dataToSave);
        setIsSaving(false);
        setValor('');
        setDescricao('');
    };

    const tipoLancamentoStyle = {
      vale: 'text-yellow-500',
      bonus: 'text-green-500',
      desconto: 'text-destructive',
      pagamento: 'text-blue-500'
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Lançamentos Financeiros: {funcionario?.nome}</DialogTitle>
                    <DialogDescription>Registe vales, bónus ou descontos para este funcionário.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                  <div className="space-y-4">
                      <div className="space-y-2">
                          <Label>Tipo de Lançamento</Label>
                          <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="vale">Vale / Adiantamento</SelectItem>
                                  <SelectItem value="bonus">Bónus / Comissão</SelectItem>
                                  <SelectItem value="desconto">Desconto (Faltas, etc)</SelectItem>
                              </SelectContent>
                          </Select>
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="valor">Valor (R$)</Label>
                          <Input id="valor" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="descricao">Descrição (Opcional)</Label>
                          <Textarea id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Adiantamento para despesa pessoal" />
                      </div>
                      <Button onClick={handleSave} disabled={isSaving} className="w-full">
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Adicionar Lançamento
                      </Button>
                  </div>
                  <div className="space-y-2">
                      <Label className="flex items-center gap-2"><History className="h-4 w-4" /> Histórico de Lançamentos</Label>
                       <ScrollArea className="h-64 rounded-md border">
                          {isLoading ? (
                            <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin"/></div>
                          ) : sortedLancamentos && sortedLancamentos.length > 0 ? (
                              <div className="p-2 text-sm">
                                {sortedLancamentos.map(lanc => (
                                  <div key={lanc.id} className="flex justify-between items-start p-2 border-b last:border-b-0">
                                      <div>
                                          <p className={cn("font-semibold capitalize", tipoLancamentoStyle[lanc.tipo])}>{lanc.tipo}</p>
                                          <p className="text-xs text-muted-foreground">{lanc.descricao}</p>
                                          <p className="text-xs text-muted-foreground">{format(parseISO(lanc.data), 'dd/MM/yyyy HH:mm')}</p>
                                      </div>
                                      <p className={cn("font-mono font-semibold", tipoLancamentoStyle[lanc.tipo])}>{formatCurrency(lanc.valor)}</p>
                                  </div>
                                ))}
                              </div>
                          ) : (
                            <div className="flex justify-center items-center h-full text-sm text-muted-foreground">Nenhum lançamento.</div>
                          )}
                       </ScrollArea>
                  </div>
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Fechar</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


const FuncionarioFormModal = ({
    isOpen,
    onClose,
    funcionario,
    onSave,
}: {
    isOpen: boolean;
    onClose: () => void;
    funcionario: Partial<Funcionario> | null;
    onSave: (data: Omit<Funcionario, 'id'>) => void;
}) => {
    const [nome, setNome] = useState('');
    const [cargo, setCargo] = useState('');
    const [salarioBase, setSalarioBase] = useState('');
    const [status, setStatus] = useState<'Ativo' | 'Inativo'>('Ativo');
    const [dataAdmissao, setDataAdmissao] = useState<Date | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (isOpen) {
            if (funcionario) {
                setNome(funcionario.nome || '');
                setCargo(funcionario.cargo || '');
                setSalarioBase(String(funcionario.salarioBase || ''));
                setStatus(funcionario.status || 'Ativo');
                if (funcionario.dataAdmissao) {
                    try {
                        // Correctly handle date parsing from yyyy-MM-dd
                        const parsedDate = parse(funcionario.dataAdmissao, 'yyyy-MM-dd', new Date());
                         if(isValid(parsedDate)){
                           setDataAdmissao(parsedDate);
                         } else {
                           setDataAdmissao(new Date());
                         }
                    } catch {
                        setDataAdmissao(new Date());
                    }
                } else {
                     setDataAdmissao(new Date());
                }
            } else {
                setNome('');
                setCargo('');
                setSalarioBase('');
                setStatus('Ativo');
                setDataAdmissao(new Date());
            }
        }
    }, [funcionario, isOpen]);

    const handleSave = () => {
        const salarioNum = parseFloat(salarioBase.replace(',', '.'));
        if (!nome.trim() || !cargo.trim() || !dataAdmissao || !salarioBase.trim() || isNaN(salarioNum)) {
            toast({
                variant: 'destructive',
                title: 'Erro de Validação',
                description: 'Por favor, preencha todos os campos obrigatórios com valores válidos.',
            });
            return;
        }

        setIsSaving(true);
        const dataToSave = {
            nome: nome.trim(),
            cargo: cargo.trim(),
            dataAdmissao: format(dataAdmissao, 'yyyy-MM-dd'),
            status,
            salarioBase: salarioNum,
        };
        onSave(dataToSave);
        setIsSaving(false);
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{funcionario?.id ? 'Editar Funcionário' : 'Adicionar Novo Funcionário'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="nome">Nome Completo</Label>
                        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do funcionário" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="cargo">Cargo</Label>
                            <Input id="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Cozinheiro, Atendente" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="salario">Salário Base (R$)</Label>
                            <Input id="salario" value={salarioBase} onChange={(e) => setSalarioBase(e.target.value)} placeholder="0,00" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Data de Admissão</Label>
                        <div className="grid grid-cols-3 gap-2">
                           <Input 
                                value={dataAdmissao ? format(dataAdmissao, 'dd') : ''} 
                                onChange={e => {
                                    const day = parseInt(e.target.value);
                                    if (day > 0 && day <= 31) {
                                        const newDate = new Date(dataAdmissao || new Date());
                                        newDate.setDate(day);
                                        setDataAdmissao(newDate);
                                    }
                                }} 
                                placeholder="DD" maxLength={2} 
                            />
                            <Input 
                                value={dataAdmissao ? format(dataAdmissao, 'MM') : ''} 
                                onChange={e => {
                                    const month = parseInt(e.target.value) - 1;
                                    if (month >= 0 && month < 12) {
                                      const newDate = new Date(dataAdmissao || new Date());
                                      newDate.setMonth(month);
                                      setDataAdmissao(newDate);
                                    }
                                }} 
                                placeholder="MM" maxLength={2} 
                            />
                            <Input 
                                value={dataAdmissao ? format(dataAdmissao, 'yyyy') : ''} 
                                onChange={e => {
                                     const year = parseInt(e.target.value);
                                     if (String(year).length === 4) {
                                      const newDate = new Date(dataAdmissao || new Date());
                                      newDate.setFullYear(year);
                                      setDataAdmissao(newDate);
                                     }
                                }} 
                                placeholder="AAAA" maxLength={4} 
                            />
                        </div>
                    </div>
                     {funcionario?.id && (
                        <div className="flex items-center space-x-2 pt-4">
                            <Label htmlFor="status-switch">Status</Label>
                             <Switch
                                id="status-switch"
                                checked={status === 'Ativo'}
                                onCheckedChange={(checked) => setStatus(checked ? 'Ativo' : 'Inativo')}
                            />
                            <span className={cn("text-sm font-medium", status === 'Ativo' ? 'text-green-500' : 'text-destructive')}>{status}</span>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const FuncionarioCard = ({ 
    funcionario, 
    onEdit,
    onOpenLancamentos
}: { 
    funcionario: Funcionario, 
    onEdit: (f: Funcionario) => void 
    onOpenLancamentos: (f: Funcionario) => void;
}) => {
    let formattedDate = 'Data inválida';
    if(funcionario.dataAdmissao) {
      try {
          const admissionDate = parse(funcionario.dataAdmissao, 'yyyy-MM-dd', new Date());
          if(isValid(admissionDate)) {
            formattedDate = format(admissionDate, 'dd/MM/yyyy', { locale: ptBR });
          }
      } catch (e) { /* ignore error, keep default */ }
    }

    return (
        <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between pb-4">
                <div>
                    <CardTitle className="text-xl">{funcionario.nome}</CardTitle>
                    <CardDescription className="flex items-center gap-1.5"><Briefcase className="h-3 w-3"/>{funcionario.cargo}</CardDescription>
                </div>
                 <Badge variant={funcionario.status === 'Ativo' ? 'default' : 'secondary'} className={cn(funcionario.status === 'Ativo' ? 'bg-green-600' : 'bg-muted-foreground')}>{funcionario.status}</Badge>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                 <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Admissão: {formattedDate}</span>
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <span>Salário Base: <span className="font-semibold text-foreground">{formatCurrency(funcionario.salarioBase)}</span></span>
                </div>
            </CardContent>
            <div className="p-4 pt-0 flex justify-end gap-1">
                <Button variant="outline" size="sm" onClick={() => onOpenLancamentos(funcionario)}>
                    <History className="mr-2 h-4 w-4"/>
                    Lançamentos
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onEdit(funcionario)}>
                    <Pencil className="mr-2 h-4 w-4"/>
                    Editar
                </Button>
            </div>
        </Card>
    )
}

export default function FuncionariosPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isLancamentoModalOpen, setIsLancamentoModalOpen] = useState(false);
    const [editingFuncionario, setEditingFuncionario] = useState<Funcionario | null>(null);
    const [statusFilter, setStatusFilter] = useState<'Todos' | 'Ativo' | 'Inativo'>('Ativo');

    const funcionariosQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'funcionarios'), orderBy('nome', 'asc')) : null,
        [firestore]
    );

    const { data: funcionarios, isLoading: isLoadingFuncionarios } = useCollection<Funcionario>(funcionariosQuery);
    
    const filteredFuncionarios = useMemo(() => {
        if (!funcionarios) return [];
        if (statusFilter === 'Todos') return funcionarios;
        return funcionarios.filter(f => f.status === statusFilter);
    }, [funcionarios, statusFilter]);

    const handleOpenFormModal = (funcionario: Funcionario | null = null) => {
        setEditingFuncionario(funcionario);
        setIsFormModalOpen(true);
    };

    const handleOpenLancamentoModal = (funcionario: Funcionario) => {
        setEditingFuncionario(funcionario);
        setIsLancamentoModalOpen(true);
    };

    const handleSaveFuncionario = (data: Omit<Funcionario, 'id'>) => {
        if (!firestore) return;
        
        const funcionariosCollection = collection(firestore, 'funcionarios');

        if (editingFuncionario?.id) {
            // Update
            const docRef = doc(funcionariosCollection, editingFuncionario.id);
            updateDocumentNonBlocking(docRef, data);
            toast({ title: 'Sucesso!', description: 'Funcionário atualizado.' });
        } else {
            // Create
            addDocumentNonBlocking(funcionariosCollection, data);
            toast({ title: 'Sucesso!', description: 'Funcionário adicionado.' });
        }
        setIsFormModalOpen(false);
    };

    const handleSaveLancamento = (data: Omit<FuncionarioLancamentoFinanceiro, 'id' | 'funcionarioId'>) => {
        if (!firestore || !editingFuncionario) return;

        const lancamentosCollection = collection(firestore, 'funcionario_lancamentos');
        const dataToSave = { ...data, funcionarioId: editingFuncionario.id };

        addDocumentNonBlocking(lancamentosCollection, dataToSave);
        toast({ title: 'Sucesso!', description: 'Lançamento financeiro adicionado.' });
        // Don't close the modal, so user can add more
    };

    return (
        <>
            <FuncionarioFormModal 
                isOpen={isFormModalOpen}
                onClose={() => setIsFormModalOpen(false)}
                funcionario={editingFuncionario}
                onSave={handleSaveFuncionario}
            />
            
            <LancamentoFinanceiroModal
                isOpen={isLancamentoModalOpen}
                onClose={() => setIsLancamentoModalOpen(false)}
                funcionario={editingFuncionario}
                onSave={handleSaveLancamento}
            />

            <div className="space-y-4">
                <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2">
                        <Label htmlFor="status-filter">Filtrar por status:</Label>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                            <SelectTrigger id="status-filter" className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Ativo">Ativos</SelectItem>
                                <SelectItem value="Inativo">Inativos</SelectItem>
                                <SelectItem value="Todos">Todos</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={() => handleOpenFormModal()}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Adicionar Funcionário
                    </Button>
                </div>

                {isLoadingFuncionarios ? (
                    <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : filteredFuncionarios.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredFuncionarios.map(f => (
                           <FuncionarioCard key={f.id} funcionario={f} onEdit={handleOpenFormModal} onOpenLancamentos={handleOpenLancamentoModal} />
                        ))}
                    </div>
                ) : (
                    <Card className="p-8 text-center text-muted-foreground">
                        <Info className="mx-auto h-8 w-8 mb-2"/>
                        <p>Nenhum funcionário encontrado para o filtro selecionado.</p>
                    </Card>
                )}
            </div>
        </>
    );
}

    