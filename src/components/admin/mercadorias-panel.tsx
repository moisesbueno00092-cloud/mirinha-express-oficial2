'use client';

import { useState, useMemo, useRef } from 'react';
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
import { Loader2, Plus, PlusCircle, Trash2, Pencil, Check, ChevronsUpDown } from 'lucide-react';
import { Separator } from '../ui/separator';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { DatePicker } from '../ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
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
    
    const [produtosLancados, setProdutosLancados] = useState<LancamentoProduto[]>([]);
    
    const [newFornecedorName, setNewFornecedorName] = useState('');
    const [isAddingFornecedor, setIsAddingFornecedor] = useState(false);
    
    // States for the new autocomplete input
    const [openCombobox, setOpenCombobox] = useState(false);
    const [selectedProductName, setSelectedProductName] = useState('');
    const [productPrice, setProductPrice] = useState('');
    const priceInputRef = useRef<HTMLInputElement>(null);


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
    
    const handleAddProduto = (e?: React.FormEvent) => {
        e?.preventDefault();
        
        const nome = selectedProductName.trim();
        const precoStr = productPrice.replace(',', '.');
        const preco = parseFloat(precoStr);

        if (!nome || isNaN(preco) || preco <= 0) {
            toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Por favor, selecione um produto e insira um preço válido.' });
            return;
        }

        setProdutosLancados(prev => [...prev, {
            id: Date.now(),
            produtoNome: nome,
            preco,
        }]);

        setSelectedProductName('');
        setProductPrice('');
    }

    const handleRemoveProduto = (id: number) => {
        setProdutosLancados(prev => prev.filter(p => p.id !== id));
    }
    
    const handleEditProduto = (produto: LancamentoProduto) => {
        setSelectedProductName(produto.produtoNome);
        setProductPrice(String(produto.preco).replace('.', ','));
        handleRemoveProduto(produto.id);
        setTimeout(() => priceInputRef.current?.focus(), 0);
    }

    const resetForm = () => {
        setFornecedorId(undefined);
        setDataVencimento(undefined);
        setProdutosLancados([]);
        setSelectedProductName('');
        setProductPrice('');
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
                <Label>Lançamento de Produto</Label>
                <form onSubmit={handleAddProduto} className="flex flex-col sm:flex-row items-start gap-2">
                     <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCombobox}
                                className="w-full sm:w-[250px] justify-between font-normal"
                            >
                            {selectedProductName
                                ? selectedProductName
                                : "Selecione um produto..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                                <CommandInput placeholder="Buscar ou criar produto..." />
                                <CommandList>
                                    <CommandEmpty
                                      onSelect={() => {
                                        const input = document.querySelector<HTMLInputElement>('input[cmdk-input]');
                                        if (input) {
                                          setSelectedProductName(input.value);
                                          setOpenCombobox(false);
                                          setTimeout(() => priceInputRef.current?.focus(), 0);
                                        }
                                      }}
                                    >
                                      Criar novo: "{document.querySelector<HTMLInputElement>('input[cmdk-input]')?.value}"
                                    </CommandEmpty>
                                    <CommandGroup>
                                    {uniqueProductNames.map((product) => (
                                        <CommandItem
                                            key={product}
                                            value={product}
                                            onSelect={(currentValue) => {
                                                setSelectedProductName(currentValue === selectedProductName.toLowerCase() ? "" : product)
                                                setOpenCombobox(false)
                                                setTimeout(() => priceInputRef.current?.focus(), 0);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedProductName.toLowerCase() === product.toLowerCase() ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {product}
                                        </CommandItem>
                                    ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    <Input
                        id="lancamento-preco" 
                        ref={priceInputRef}
                        placeholder="Preço (ex: 25,90)"
                        value={productPrice}
                        onChange={(e) => setProductPrice(e.target.value)}
                        className='w-full sm:w-auto sm:flex-grow'
                    />

                    <Button type="submit" size="icon" className='w-full sm:w-auto' disabled={!selectedProductName || !productPrice}>
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