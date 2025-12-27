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
import { Popover, PopoverContent, PopoverAnchor } from '../ui/popover';
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
    
    const [lancamentoInput, setLancamentoInput] = useState('');
    const [produtosLancados, setProdutosLancados] = useState<LancamentoProduto[]>([]);
    
    const [newFornecedorName, setNewFornecedorName] = useState('');
    const [isAddingFornecedor, setIsAddingFornecedor] = useState(false);
    
    const lancamentoInputRef = useRef<HTMLInputElement>(null);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

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
    
    const isSuggestionsOpen = suggestions.length > 0;

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (lancamentoInputRef.current && !lancamentoInputRef.current.contains(event.target as Node)) {
                setSuggestions([]);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, []);

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
        setLancamentoInput(value);
    
        const endsWithPrice = /\s[\d,.]+$/.test(value);
    
        if (value && !endsWithPrice) {
            const lowercasedValue = value.toLowerCase();
            const filteredSuggestions = uniqueProductNames.filter(name =>
                name.toLowerCase().startsWith(lowercasedValue)
            );
            setSuggestions(filteredSuggestions);
            setActiveSuggestionIndex(0);
        } else {
            setSuggestions([]);
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setLancamentoInput(suggestion + ' ');
        setSuggestions([]);
        lancamentoInputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (isSuggestionsOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                 if (suggestions[activeSuggestionIndex]) {
                    e.preventDefault();
                    handleSuggestionClick(suggestions[activeSuggestionIndex]);
                }
            } else if (e.key === 'Escape') {
                setSuggestions([]);
            }
        }
    };

    const handleAddProduto = (e: React.FormEvent) => {
        e.preventDefault();
        const input = lancamentoInput.trim();
        if (!input) return;

        setSuggestions([]);

        const parts = input.split(' ');
        const precoStr = parts.pop()?.replace(',', '.');
        const nome = parts.join(' ');
        const preco = parseFloat(precoStr || '');
        
        if (!nome || isNaN(preco) || preco <= 0) {
            toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Por favor, use o formato "Nome do Produto Preço". Ex: Arroz 5kg 25,90' });
            return;
        }

        setProdutosLancados(prev => [...prev, {
            id: Date.now(),
            produtoNome: nome,
            preco,
        }]);

        setLancamentoInput('');
    }

    const handleRemoveProduto = (id: number) => {
        setProdutosLancados(prev => prev.filter(p => p.id !== id));
    }
    
    const handleEditProduto = (produto: LancamentoProduto) => {
        setLancamentoInput(`${produto.produtoNome} ${String(produto.preco).replace('.', ',')}`);
        handleRemoveProduto(produto.id);
        setTimeout(() => lancamentoInputRef.current?.focus(), 0);
    }

    const resetForm = () => {
        setFornecedorId(undefined);
        setDataVencimento(undefined);
        setProdutosLancados([]);
        setLancamentoInput('');
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
                <Label htmlFor="lancamento-produto">Lançamento de Produto</Label>
                <form onSubmit={handleAddProduto} className="flex items-end gap-2">
                    <Popover open={isSuggestionsOpen} onOpenChange={(open) => !open && setSuggestions([])}>
                        <PopoverAnchor asChild>
                            <div className="flex-grow space-y-2">
                                <Input 
                                    id="lancamento-produto"
                                    ref={lancamentoInputRef}
                                    placeholder="Ex: Arroz 5kg 25,90"
                                    value={lancamentoInput}
                                    onChange={handleLancamentoChange}
                                    onKeyDown={handleKeyDown}
                                    autoComplete="off"
                                />
                            </div>
                        </PopoverAnchor>
                        <PopoverContent 
                            className="w-[--radix-popover-trigger-width] p-1"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                            <div className="max-h-60 overflow-y-auto">
                                {suggestions.map((suggestion, index) => (
                                    <div
                                        key={suggestion}
                                        className={cn(
                                            "cursor-pointer p-2 text-sm rounded-sm",
                                            index === activeSuggestionIndex ? "bg-accent" : ""
                                        )}
                                        onMouseDown={() => handleSuggestionClick(suggestion)}
                                    >
                                        {suggestion}
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                     <Button type="submit" size="icon" disabled={!lancamentoInput.trim()}>
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
