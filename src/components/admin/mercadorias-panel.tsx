'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ContaAPagar, EntradaMercadoria, Fornecedor } from '@/types';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, PlusCircle, Trash2, Pencil, Settings } from 'lucide-react';
import { Separator } from '../ui/separator';
import { format as formatDateFn } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { DatePicker } from '../ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import FornecedoresEditModal from './fornecedores-edit-modal';


interface LancamentoProduto {
    id: number;
    produtoNome: string;
    preco: number; // This will be the total price (quantity * unit price)
    quantidade: number;
    precoUnitario: number;
}

interface ProductSuggestion {
    name: string;
    lastPrice: number;
}


export default function MercadoriasPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [fornecedorId, setFornecedorId] = useState<string | undefined>(undefined);
    const [dataVencimento, setDataVencimento] = usePersistentState<Date | undefined>('mercadorias.dataVencimento', undefined);
    const [produtosLancados, setProdutosLancados] = useState<LancamentoProduto[]>([]);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [newFornecedorName, setNewFornecedorName] = useState('');
    const [isAddingFornecedor, setIsAddingFornecedor] = useState(false);
    
    const [lancamentoInput, setLancamentoInput] = useState('');
    const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
    const lancamentoInputRef = useRef<HTMLInputElement>(null);
    const [isFornecedoresModalOpen, setIsFornecedoresModalOpen] = useState(false);


    const fornecedoresQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null,
        [firestore]
    );
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    
    const allEntradasQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'entradas_mercadorias'), orderBy('data', 'desc')) : null,
        [firestore]
    );
    const { data: allEntradas } = useCollection<EntradaMercadoria>(allEntradasQuery);
    
    useEffect(() => {
        const ensureDeliveryProvider = async () => {
            if (!firestore || isLoadingFornecedores || !fornecedores) return;
            const deliveryProviderExists = fornecedores.some(f => f.id === 'delivery_fees_provider');
            if (!deliveryProviderExists) {
                const docRef = doc(firestore, 'fornecedores', 'delivery_fees_provider');
                await setDoc(docRef, { nome: 'Taxas de Entrega' });
            }
        };
        ensureDeliveryProvider();
    }, [firestore, fornecedores, isLoadingFornecedores]);
    
    const productSuggestions = useMemo((): ProductSuggestion[] => {
        if (!allEntradas) return [];
        const latestEntries = new Map<string, EntradaMercadoria>();
        
        // As entradas já vêm ordenadas pela data descendente
        for (const entry of allEntradas) {
            const normalizedName = entry.produtoNome.toLowerCase();
            if (!latestEntries.has(normalizedName)) {
                latestEntries.set(normalizedName, entry);
            }
        }
        
        return Array.from(latestEntries.values())
          .map(entry => ({
            name: entry.produtoNome,
            lastPrice: entry.precoUnitario,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
    }, [allEntradas]);

    useEffect(() => {
      const trimmedInput = lancamentoInput.trim();
      if (trimmedInput === '') {
          setSuggestions([]);
          setIsSuggestionsOpen(false);
          return;
      }
      
      const lastSpaceIndex = trimmedInput.lastIndexOf(' ');
      const hasPrice = lastSpaceIndex > -1 && /[\d,.]+$/.test(trimmedInput.substring(lastSpaceIndex + 1));

      if (hasPrice) {
          setSuggestions([]);
          setIsSuggestionsOpen(false);
          return;
      }
      
      const filtered = productSuggestions.filter(p => 
          p.name.toLowerCase().startsWith(trimmedInput.toLowerCase()) &&
          p.name.toLowerCase() !== trimmedInput.toLowerCase()
      );
      
      setSuggestions(filtered);
      setIsSuggestionsOpen(filtered.length > 0);

    }, [lancamentoInput, productSuggestions]);
    
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
    
    const handleAddProduto = (e?: React.FormEvent) => {
        e?.preventDefault();
        
        const input = lancamentoInput.trim();
        if (!input) return;

        let nomeParte = input;
        let precoUnitarioStr: string | undefined;
        let quantidade = 1;
        
        const unRegex = /^(.*)\s+(\d+)un\s+([\d,.]+)$/i;
        const unMatch = input.match(unRegex);

        if (unMatch) {
            nomeParte = `${unMatch[1].trim()} ${unMatch[2]}un`;
            quantidade = parseInt(unMatch[2], 10);
            precoUnitarioStr = unMatch[3];
        } else {
            const lastSpaceIndex = input.lastIndexOf(' ');
            if (lastSpaceIndex > -1 && lastSpaceIndex < input.length - 1) {
                const potentialPrice = input.substring(lastSpaceIndex + 1);
                if (/^[\d,.]+$/.test(potentialPrice)) {
                    nomeParte = input.substring(0, lastSpaceIndex).trim();
                    precoUnitarioStr = potentialPrice;
                }
            }
        }
        
        if (!precoUnitarioStr) {
            toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Formato inválido. Use: <Nome> <Preço> ou <Nome> <Qtd>un <Preço Unit>.'});
            return;
        }

        const precoUnitario = parseFloat(precoUnitarioStr.replace(',', '.'));

        if (isNaN(precoUnitario) || precoUnitario <= 0) {
            toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Preço do produto inválido.' });
            return;
        }

        if (!nomeParte.trim()) {
             toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Nome do produto não pode ser vazio.' });
            return;
        }
        
        const precoTotal = quantidade * precoUnitario;

        setProdutosLancados(prev => [...prev, {
            id: Date.now(),
            produtoNome: nomeParte, 
            preco: precoTotal,
            quantidade,
            precoUnitario: precoUnitario,
        }]);

        setLancamentoInput('');
        setIsSuggestionsOpen(false);
    }

    const handleSelectSuggestion = (suggestion: ProductSuggestion) => {
        setLancamentoInput(`${suggestion.name} ${String(suggestion.lastPrice).replace('.', ',')}`);
        setIsSuggestionsOpen(false);
        setTimeout(() => {
            lancamentoInputRef.current?.focus();
            // Move cursor to the end
            const valLength = lancamentoInputRef.current?.value.length;
            if (valLength) {
                lancamentoInputRef.current?.setSelectionRange(valLength, valLength);
            }
        }, 0);
    }

    const handleRemoveProduto = (id: number) => {
        setProdutosLancados(prev => prev.filter(p => p.id !== id));
    }
    
    const handleEditProduto = (produto: LancamentoProduto) => {
        const inputToEdit = `${produto.produtoNome} ${String(produto.precoUnitario).replace('.', ',')}`.replace(/\s+\d+un/, ` ${produto.quantidade}un`);
        
        setLancamentoInput(inputToEdit);
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
        if (!firestore || !fornecedorId || produtosLancados.length === 0) {
            toast({ variant: 'destructive', title: 'Faltam dados', description: 'Por favor, selecione um fornecedor e adicione pelo menos um produto.' });
            return;
        }
        setIsSubmitting(true);

        try {
            const fornecedorNome = fornecedores?.find(f => f.id === fornecedorId)?.nome || 'Fornecedor desconhecido';
            
            const vencimentoFinal = dataVencimento || new Date();
            const estaPaga = !dataVencimento;

            const novaConta: Omit<ContaAPagar, 'id'> = {
                descricao: `Compra de mercadorias - ${fornecedorNome}`,
                fornecedorId: fornecedorId,
                valor: totalCompra,
                dataVencimento: formatDateFn(vencimentoFinal, 'yyyy-MM-dd'),
                estaPaga: estaPaga,
            };
            await addDocumentNonBlocking(collection(firestore, 'contas_a_pagar'), novaConta);
            
            const batch = writeBatch(firestore);
            const entradasCollection = collection(firestore, 'entradas_mercadorias');
            
            const unRegex = /\s*(\d+)un\b/i;

            produtosLancados.forEach(produto => {
                const unMatch = produto.produtoNome.match(unRegex);
                const produtoNomeLimpo = unMatch ? produto.produtoNome.replace(unMatch[0], '').trim() : produto.produtoNome;

                const novaEntrada: Omit<EntradaMercadoria, 'id'> = {
                    produtoNome: produtoNomeLimpo,
                    fornecedorId: fornecedorId,
                    data: new Date().toISOString(),
                    quantidade: produto.quantidade,
                    precoUnitario: produto.precoUnitario,
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
        <>
            <FornecedoresEditModal
                isOpen={isFornecedoresModalOpen}
                onClose={() => setIsFornecedoresModalOpen(false)}
                fornecedores={fornecedores || []}
            />
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
                        <div className="flex items-center gap-2">
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
                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setIsFornecedoresModalOpen(true)} disabled={isLoadingFornecedores}>
                                <Settings className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2 self-end">
                        <Label htmlFor="vencimento">Data de Vencimento da Fatura</Label>
                        <DatePicker date={dataVencimento} setDate={setDataVencimento} />
                        <p className="text-xs text-muted-foreground">Deixe em branco para pagamento no dia (à vista).</p>
                    </div>
                </div>
                
                <Separator />

                <div className="space-y-2">
                    <Label htmlFor='lancamento-input'>Lançamento de Produto (Nome, Quantidade e Preço Unitário)</Label>
                    <Popover open={isSuggestionsOpen} onOpenChange={setIsSuggestionsOpen}>
                        <PopoverTrigger asChild>
                            <form onSubmit={handleAddProduto} className="flex items-start gap-2">
                                <Input
                                    id='lancamento-input'
                                    ref={lancamentoInputRef}
                                    placeholder="Ex: Coca 2L 10,50 ou Detergente 5un 2,30"
                                    value={lancamentoInput}
                                    onChange={(e) => setLancamentoInput(e.target.value)}
                                    className='w-full'
                                    autoComplete='off'
                                    onBlur={() => setTimeout(() => setIsSuggestionsOpen(false), 150)}
                                    onFocus={() => {
                                      const trimmedInput = lancamentoInput.trim();
                                      if (trimmedInput !== '' && suggestions.length > 0) {
                                          setIsSuggestionsOpen(true);
                                      }
                                    }}
                                />
                                 <Button 
                                    type="submit"
                                    size="icon"
                                    className="h-10 w-10 shrink-0"
                                    disabled={!lancamentoInput.trim()}
                                >
                                    <Plus className="h-5 w-5" />
                                </Button>
                            </form>
                        </PopoverTrigger>
                        <PopoverContent 
                          className='w-[--radix-popover-trigger-width] p-0' 
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <ul className='max-h-60 overflow-y-auto'>
                            {suggestions.map((suggestion, index) => (
                              <li
                                key={index}
                                className='px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center gap-2'
                                onMouseDown={() => handleSelectSuggestion(suggestion)}
                              >
                                <span>{suggestion.name}</span>
                                <span className='font-mono text-sm text-green-500'>{formatCurrency(suggestion.lastPrice)}</span>
                              </li>
                            ))}
                          </ul>
                        </PopoverContent>
                    </Popover>
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
                        disabled={isSubmitting || !fornecedorId || produtosLancados.length === 0}
                    >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Registar Entrada e Criar Conta a Pagar
                    </Button>
                </div>

            </div>
        </>
    );
}
