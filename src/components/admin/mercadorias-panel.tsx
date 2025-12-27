
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ContaAPagar, EntradaMercadoria, Fornecedor } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, PlusCircle, Trash2, Pencil } from 'lucide-react';
import { Separator } from '../ui/separator';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { DatePicker } from '../ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '../ui/popover';
import { cn } from '@/lib/utils';


interface LancamentoProduto {
    id: number;
    produtoNome: string;
    preco: number;
}

export default function MercadoriasPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [fornecedorId, setFornecedorId] = useState<string | undefined>();
    const [dataVencimento, setDataVencimento] = useState<Date | undefined>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // States for the new product entry form
    const [lancamento, setLancamento] = useState('');
    const [produtosLancados, setProdutosLancados] = useState<LancamentoProduto[]>([]);
    
    const [newFornecedorName, setNewFornecedorName] = useState('');
    const [isAddingFornecedor, setIsAddingFornecedor] = useState(false);
    
    // Autocomplete state
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const lancamentoInputRef = useRef<HTMLInputElement>(null);

    const fornecedoresQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null,
        [firestore]
    );
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    
    const allEntradasQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'entradas_mercadorias')) : null,
        [firestore]
    );
    const { data: allEntradas } = useCollection<EntradaMercadoria>(allEntradasQuery);
    
    const uniqueProductNames = useMemo(() => {
        if (!allEntradas) return [];
        const productNames = allEntradas.map(e => e.produtoNome);
        return [...new Set(productNames)].sort();
    }, [allEntradas]);
    
    const handleAddFornecedor = async () => {
        if (!firestore || !newFornecedorName.trim()) return;

        setIsAddingFornecedor(true);
        try {
            await addDocumentNonBlocking(collection(firestore, 'fornecedores'), {
                nome: newFornecedorName.trim(),
            });
            toast({ title: 'Sucesso', description: 'Fornecedor adicionado.' });
            setNewFornecedorName('');
        } catch (error) {
            console.error("Erro ao adicionar fornecedor: ", error);
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível adicionar o fornecedor.' });
        } finally {
            setIsAddingFornecedor(false);
        }
    };
    
    const handleLancamentoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setLancamento(value);
        setActiveIndex(-1);

        if (value && !/\s\d/.test(value)) {
            const filteredSuggestions = uniqueProductNames.filter(name =>
                name.toLowerCase().startsWith(value.toLowerCase())
            );
            setSuggestions(filteredSuggestions);
            setIsSuggestionsOpen(filteredSuggestions.length > 0);
        } else {
            setSuggestions([]);
            setIsSuggestionsOpen(false);
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setLancamento(suggestion + ' ');
        setSuggestions([]);
        setIsSuggestionsOpen(false);
        lancamentoInputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isSuggestionsOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prevIndex => (prevIndex + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prevIndex => (prevIndex - 1 + suggestions.length) % suggestions.length);
        } else if ((e.key === 'Enter' || e.key === 'Tab') && activeIndex >= 0) {
            e.preventDefault();
            handleSuggestionClick(suggestions[activeIndex]);
        } else if (e.key === 'Escape') {
            setIsSuggestionsOpen(false);
        }
    };


    const handleAddProduto = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedLancamento = lancamento.trim();
        
        // Find the last space to separate product name and price
        const lastSpaceIndex = trimmedLancamento.lastIndexOf(' ');
        if (lastSpaceIndex === -1) {
             toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Formato inválido. Use "Nome do Produto Preço".' });
            return;
        }

        const nome = trimmedLancamento.substring(0, lastSpaceIndex).trim();
        const precoStr = trimmedLancamento.substring(lastSpaceIndex + 1).replace(',', '.');
        const preco = parseFloat(precoStr);

        if (!nome || isNaN(preco) || preco <= 0) {
            toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Por favor, preencha o nome e um preço válido.' });
            return;
        }

        setProdutosLancados(prev => [...prev, {
            id: Date.now(),
            produtoNome: nome,
            preco,
        }]);

        setLancamento('');
        lancamentoInputRef.current?.focus();
    }

    const handleRemoveProduto = (id: number) => {
        setProdutosLancados(prev => prev.filter(p => p.id !== id));
    }
    
    const handleEditProduto = (produto: LancamentoProduto) => {
        setLancamento(`${produto.produtoNome} ${String(produto.preco).replace('.', ',')}`);
        handleRemoveProduto(produto.id);
        lancamentoInputRef.current?.focus();
    }

    const resetForm = () => {
        setFornecedorId(undefined);
        setDataVencimento(undefined);
        setProdutosLancados([]);
        setLancamento('');
    }

    const handleRegisterEntry = async () => {
        if (!firestore || !fornecedorId || !dataVencimento || produtosLancados.length === 0) {
            toast({ variant: 'destructive', title: 'Faltam dados', description: 'Por favor, preencha todos os campos e adicione pelo menos um produto.' });
            return;
        }
        setIsSubmitting(true);

        try {
            const fornecedorNome = fornecedores?.find(f => f.id === fornecedorId)?.nome || 'Fornecedor desconhecido';

            const novaConta: Omit<ContaAPagar, 'id'> = {
                descricao: `Compra de mercadorias - ${fornecedorNome}`,
                fornecedorId: fornecedorId,
                valor: totalCompra,
                dataVencimento: format(dataVencimento, 'yyyy-MM-dd'),
                estaPaga: false,
            };
            await addDocumentNonBlocking(collection(firestore, 'contas_a_pagar'), novaConta);
            
            const batch = writeBatch(firestore);
            const entradasCollection = collection(firestore, 'entradas_mercadorias');
            
            produtosLancados.forEach(produto => {
                const novaEntrada: Omit<EntradaMercadoria, 'id'> = {
                    produtoNome: produto.produtoNome.trim(),
                    fornecedorId: fornecedorId,
                    data: new Date().toISOString(),
                    quantidade: 1, 
                    precoUnitario: produto.preco,
                    valorTotal: produto.preco,
                };
                const docRef = doc(entradasCollection);
                batch.set(docRef, novaEntrada);
            });
            
            await batch.commit();

            toast({ title: 'Sucesso!', description: 'Entrada de mercadoria e conta a pagar registadas.' });
            resetForm();
        } catch (error) {
            console.error("Erro ao registar entrada:", error);
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível registar a entrada.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const totalCompra = useMemo(() => {
        return produtosLancados.reduce((acc, p) => acc + (p.preco || 0), 0);
    }, [produtosLancados]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(value);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="fornecedor">Fornecedor</Label>
                    <div className='flex items-center gap-2'>
                        <Input
                            id="new-fornecedor"
                            placeholder="Adicionar novo fornecedor..."
                            value={newFornecedorName}
                            onChange={(e) => setNewFornecedorName(e.target.value)}
                            disabled={isAddingFornecedor}
                            className="h-9"
                        />
                        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={handleAddFornecedor} disabled={isAddingFornecedor || !newFornecedorName.trim()}>
                            {isAddingFornecedor ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                        </Button>
                    </div>
                    <Select value={fornecedorId} onValueChange={setFornecedorId}>
                        <SelectTrigger id="fornecedor" disabled={isLoadingFornecedores}>
                            <SelectValue placeholder={isLoadingFornecedores ? "A carregar..." : "Selecione um fornecedor"} />
                        </SelectTrigger>
                        <SelectContent>
                            {fornecedores?.map(f => (
                                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2 self-end">
                    <Label htmlFor="vencimento">Data de Vencimento da Fatura</Label>
                    <DatePicker date={dataVencimento} setDate={setDataVencimento} />
                </div>
            </div>
            
            <Separator />

            <div className="space-y-4">
                <Label htmlFor='lancamento-produto'>Lançamento de Produto</Label>
                <form onSubmit={handleAddProduto} className="flex items-start gap-2">
                     <Popover open={isSuggestionsOpen} onOpenChange={setIsSuggestionsOpen}>
                        <PopoverAnchor asChild>
                            <Input
                                id="lancamento-produto" 
                                ref={lancamentoInputRef}
                                placeholder="Nome do Produto Preço (ex: Arroz 25,90)"
                                value={lancamento}
                                onChange={handleLancamentoChange}
                                onKeyDown={handleKeyDown}
                                autoComplete="off"
                                className='flex-grow'
                            />
                        </PopoverAnchor>
                        <PopoverContent 
                            className="w-[--radix-popover-trigger-width] p-0" 
                            align="start"
                            onOpenAutoFocus={(e) => e.preventDefault()} // Prevent focus stealing
                        >
                            <div className="max-h-60 overflow-y-auto">
                                {suggestions.map((s, i) => (
                                    <div
                                        key={s}
                                        className={cn(
                                            "p-2 text-sm cursor-pointer hover:bg-accent",
                                            i === activeIndex && "bg-accent"
                                        )}
                                        onMouseDown={(e) => { // Use onMouseDown to prevent blur event from firing first
                                            e.preventDefault();
                                            handleSuggestionClick(s);
                                        }}
                                    >
                                        {s}
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                     <Button type="submit" size="icon" disabled={!lancamento.trim()}>
                        <Plus className="h-4 w-4"/>
                    </Button>
                </form>
            </div>
            
            {produtosLancados.length > 0 && (
                 <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Produtos nesta Entrada</h3>
                    <div className="rounded-md border">
                        {produtosLancados.map(p => (
                            <div key={p.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                                <span>{p.produtoNome}</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono">{formatCurrency(p.preco || 0)}</span>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditProduto(p)}>
                                        <Pencil className="h-4 w-4 text-blue-500" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveProduto(p.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                     <div className="flex justify-end items-center gap-4 pt-2 font-semibold">
                        <span>Total da Compra:</span>
                        <span className="text-xl text-primary">{formatCurrency(totalCompra)}</span>
                    </div>
                </div>
            )}


            <div className="flex justify-end pt-4">
                <Button 
                    onClick={handleRegisterEntry}
                    disabled={isSubmitting || !fornecedorId || !dataVencimento || produtosLancados.length === 0}
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Registar Entrada e Criar Conta a Pagar
                </Button>
            </div>

        </div>
    );
}

    