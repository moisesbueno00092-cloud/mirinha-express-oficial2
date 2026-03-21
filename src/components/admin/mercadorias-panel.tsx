
'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc, setDoc, addDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ContaAPagar, EntradaMercadoria, Fornecedor, ParsedRomaneioItem, BomboniereItem } from '@/types';
import { parseRomaneio } from '@/ai/flows/parse-romaneio-flow';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, PlusCircle, Trash2, Pencil, Settings, Camera, Video, ChevronUp, ChevronDown } from 'lucide-react';
import { Separator } from '../ui/separator';
import { format as formatDateFn, addDays, parseISO, isValid } from 'date-fns';
import { DatePicker } from '../ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import FornecedoresEditModal from './fornecedores-edit-modal';
import { ScrollArea } from '../ui/scroll-area';
import CameraCaptureSheet from './camera-capture-sheet';


interface LancamentoProduto {
    id: number;
    produtoNome: string;
    preco: number;
    quantidade: number;
    precoUnitario: number;
}

interface ProductSuggestion {
    name: string;
    lastPrice: number;
}

const generateStrongColor = () => {
  const h = Math.floor(Math.random() * 360);
  const s = Math.floor(Math.random() * 20) + 80;
  const l = Math.floor(Math.random() * 20) + 65;
  return `hsl(${h}, ${s}%, ${l}%)`;
};

const findBestBomboniereMatch = (productName: string, bomboniereItems: BomboniereItem[]): BomboniereItem | undefined => {
    if (!productName || !bomboniereItems) return undefined;

    const lowerProductName = productName.toLowerCase();
    let bestMatch: BomboniereItem | undefined = undefined;
    let longestMatchLength = 0;

    for (const bomboniereItem of bomboniereItems) {
        const baseBomboniereName = bomboniereItem.name.toLowerCase().replace(/\s*\(.*\)\s*/, '').trim();

        if (!baseBomboniereName) continue;
        
        if (lowerProductName.startsWith(baseBomboniereName)) {
            if (baseBomboniereName.length > longestMatchLength) {
                bestMatch = bomboniereItem;
                longestMatchLength = baseBomboniereName.length;
            }
        }
    }

    return bestMatch;
};

/**
 * Função de Compressão de Imagem no Cliente
 * Reduz o peso da imagem para evitar o erro de 1MB e acelerar a IA.
 */
const compressImage = (dataUri: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            let width = img.width;
            let height = img.height;
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            // Reduz qualidade para 70% para garantir ficheiro leve e envio rápido
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUri;
    });
};


export default function MercadoriasPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [fornecedorId, setFornecedorId] = useState<string | undefined>(undefined);
    const [dataVencimento, setDataVencimento] = useState<Date | undefined>(undefined);
    const [produtosLancados, setProdutosLancados] = useState<LancamentoProduto[]>([]);
    const [numParcelas, setNumParcelas] = useState('1');
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isParsingRomaneio, setIsParsingRomaneio] = useState(false);
    
    const [newFornecedorName, setNewFornecedorName] = useState('');
    const [isAddingFornecedor, setIsAddingFornecedor] = useState(false);
    
    const [lancamentoInput, setLancamentoInput] = useState('');
    const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
    const lancamentoInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isFornecedoresModalOpen, setIsFornecedoresModalOpen] = useState(false);
    const [isCameraSheetOpen, setIsCameraSheetOpen] = useState(false);

    const scrollViewportRef = useRef<HTMLDivElement>(null);

    const fornecedoresQuery = useMemo(
        () => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null,
        [firestore]
    );
    const { data: fornecedores, isLoading: isLoadingFornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    
    const allEntradasQuery = useMemo(
        () => firestore ? query(collection(firestore, 'entradas_mercadorias'), orderBy('data', 'desc')) : null,
        [firestore]
    );
    const { data: allEntradas } = useCollection<EntradaMercadoria>(allEntradasQuery);
    
    const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);
    const { data: bomboniereItems, isLoading: isLoadingBomboniere } = useCollection<BomboniereItem>(bomboniereItemsQuery);

    const matchSupplierByName = useCallback((name: string) => {
        if (!name || !fornecedores) return undefined;
        const searchName = name.toLowerCase();
        return fornecedores.find(f => 
            f.nome.toLowerCase().includes(searchName) || 
            searchName.includes(f.nome.toLowerCase())
        );
    }, [fornecedores]);

    useEffect(() => {
        const ensureProviders = async () => {
            if (!firestore || isLoadingFornecedores || !fornecedores) return;
            const providersToEnsure = [
                { id: 'delivery_fees_provider', name: 'Taxas de Entrega', color: '#9ca3af' },
                { id: 'extra_expenses_provider', name: 'Despesas Extras', color: '#6b7280' }
            ];
            const batch = writeBatch(firestore);
            let needsCommit = false;
            for (const provider of providersToEnsure) {
                if (!fornecedores.some(f => f.id === provider.id)) {
                    batch.set(doc(firestore, 'fornecedores', provider.id), { nome: provider.name, color: provider.color });
                    needsCommit = true;
                }
            }
            if (needsCommit) await batch.commit();
        };
        ensureProviders();
    }, [firestore, fornecedores, isLoadingFornecedores]);

    useEffect(() => {
        const assignMissingColors = async () => {
            if (!firestore || !fornecedores || fornecedores.length === 0) return;
            const toUpdate = fornecedores.filter(f => !f.color);
            if (toUpdate.length > 0) {
                const batch = writeBatch(firestore);
                toUpdate.forEach(f => batch.update(doc(firestore, 'fornecedores', f.id), { color: generateStrongColor() }));
                await batch.commit();
            }
        };
        assignMissingColors();
    }, [firestore, fornecedores]);
    
    const productSuggestions = useMemo((): ProductSuggestion[] => {
        if (!allEntradas) return [];
        const latestEntries = new Map<string, EntradaMercadoria>();
        for (const entry of allEntradas) {
            const normalizedName = entry.produtoNome.toLowerCase();
            if (!latestEntries.has(normalizedName)) latestEntries.set(normalizedName, entry);
        }
        return Array.from(latestEntries.values())
          .map(entry => ({ name: entry.produtoNome, lastPrice: entry.precoUnitario }))
          .sort((a, b) => a.name.localeCompare(b.name));
    }, [allEntradas]);

    useEffect(() => {
      const trimmedInput = lancamentoInput.trim();
      if (trimmedInput === '') { setSuggestions([]); setIsSuggestionsOpen(false); return; }
      const lastSpaceIndex = trimmedInput.lastIndexOf(' ');
      const hasPrice = lastSpaceIndex > -1 && /[\d,.]+$/.test(trimmedInput.substring(lastSpaceIndex + 1));
      if (hasPrice) { setSuggestions([]); setIsSuggestionsOpen(false); return; }
      const filtered = productSuggestions.filter(p => p.name.toLowerCase().startsWith(trimmedInput.toLowerCase()) && p.name.toLowerCase() !== trimmedInput.toLowerCase());
      setSuggestions(filtered); setIsSuggestionsOpen(filtered.length > 0);
    }, [lancamentoInput, productSuggestions]);
    
    const handleAddFornecedor = async () => {
        if (!firestore || !newFornecedorName.trim()) return;
        setIsAddingFornecedor(true);
        try {
            await addDoc(collection(firestore, 'fornecedores'), { nome: newFornecedorName.trim(), color: generateStrongColor() });
            toast({ title: 'Sucesso', description: 'Fornecedor adicionado.' });
            setNewFornecedorName('');
        } catch (error) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível adicionar.' });
        } finally { setIsAddingFornecedor(false); }
    };
    
    const handleRegisterEntry = async () => {
        if (!firestore || produtosLancados.length === 0 || isLoadingBomboniere || isSubmitting) return;
        setIsSubmitting(true);
        const romaneioId = doc(collection(firestore, '_')).id;
        const finalFornecedorId = fornecedorId || 'extra_expenses_provider';
        try {
            const vencimentoBase = dataVencimento || new Date();
            const estaPaga = !dataVencimento;
            const parcelas = estaPaga ? 1 : parseInt(numParcelas, 10);
            const valorParcela = totalCompra / parcelas;
            const batch = writeBatch(firestore);
            const nomesProdutos = produtosLancados.map(p => `${p.quantidade > 1 ? `${p.quantidade}x ` : ''}${p.produtoNome}`).join(', ');
            const displayDescription = nomesProdutos.length > 100 ? nomesProdutos.substring(0, 97) + '...' : nomesProdutos;

            for (let i = 0; i < parcelas; i++) {
                const vencimentoParcela = estaPaga ? vencimentoBase : addDays(vencimentoBase, i * 7);
                batch.set(doc(collection(firestore, 'contas_a_pagar')), {
                    descricao: `${displayDescription} ${parcelas > 1 ? `(${i + 1}/${parcelas})` : ''}`.trim(),
                    fornecedorId: finalFornecedorId, valor: valorParcela,
                    dataVencimento: formatDateFn(vencimentoParcela, 'yyyy-MM-dd'),
                    estaPaga: estaPaga, romaneioId: romaneioId,
                });
            }

            for (const produto of produtosLancados) {
                batch.set(doc(collection(firestore, 'entradas_mercadorias')), {
                    produtoNome: produto.produtoNome, fornecedorId: finalFornecedorId,
                    data: new Date().toISOString(), quantidade: produto.quantidade,
                    precoUnitario: produto.precoUnitario, valorTotal: produto.preco,
                    estaPaga: estaPaga, romaneioId: romaneioId,
                });
                const matchedBomboniereItem = findBestBomboniereMatch(produto.produtoNome, bomboniereItems || []);
                if (matchedBomboniereItem) {
                    const currentStock = bomboniereItems?.find(bi => bi.id === matchedBomboniereItem.id)?.estoque ?? 0;
                    batch.update(doc(firestore, 'bomboniere_items', matchedBomboniereItem.id), { estoque: currentStock + produto.quantidade });
                }
            }
            await batch.commit();
            toast({ title: estaPaga ? 'Lançamento Realizado!' : 'Compra Registada!', description: estaPaga ? `Compra de ${formatCurrency(totalCompra)} finalizada.` : `Entrada e ${parcelas} parcelas criadas.` });
            resetForm();
        } catch (error) { toast({ variant: 'destructive', title: 'Erro ao registar' }); } finally { setIsSubmitting(false); }
    }

    const handleAddProduto = (e?: React.FormEvent) => {
        e?.preventDefault();
        const input = lancamentoInput.trim();
        // Se Enter for pressionado com campo vazio e já houver itens, finaliza o registo instantaneamente
        if (!input) { 
            if (produtosLancados.length > 0 && !isSubmitting) {
                handleRegisterEntry();
            }
            return; 
        }
        let precoUnitario = 0, quantidade = 1, precoTotal = 0, produtoNomeFinal = "";
        const isNumericStr = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);
        const unitRegex = /^(.*?)\s*(un|kg)\s+([\d,.]+)\s+([\d,.]+)$/i;
        const unitMatch = input.match(unitRegex);
        if (unitMatch) {
            const [, desc, unit, qtyStr, priceStr] = unitMatch;
            quantidade = parseFloat(qtyStr.replace(',', '.')); precoUnitario = parseFloat(priceStr.replace(',', '.'));
            precoTotal = quantidade * precoUnitario; produtoNomeFinal = `${desc} ${unit}`.trim();
        } else {
            const lastSpaceIndex = input.lastIndexOf(' ');
            if (lastSpaceIndex > -1) {
                const potentialPrice = input.substring(lastSpaceIndex + 1);
                if (isNumericStr(potentialPrice)) {
                    const nomeParte = input.substring(0, lastSpaceIndex).trim();
                    precoUnitario = parseFloat(potentialPrice.replace(',', '.'));
                    const qtyMatch = nomeParte.match(/^(.*)\s+(\d+)(un|kg)$/i);
                    if (qtyMatch) { produtoNomeFinal = qtyMatch[1].trim(); quantidade = parseInt(qtyMatch[2], 10); } 
                    else { produtoNomeFinal = nomeParte; quantidade = 1; }
                    precoTotal = quantidade * precoUnitario;
                } else return;
            } else return;
        }
        if (isNaN(precoTotal) || precoTotal <= 0 || !produtoNomeFinal.trim()) return;
        setProdutosLancados(prev => [...prev, { id: Date.now() + Math.random(), produtoNome: produtoNomeFinal, preco: precoTotal, quantidade, precoUnitario }]);
        setLancamentoInput(''); setIsSuggestionsOpen(false);
    }

    const handleSelectSuggestion = (suggestion: ProductSuggestion) => {
        setLancamentoInput(`${suggestion.name} ${String(suggestion.lastPrice).replace('.', ',')}`);
        setIsSuggestionsOpen(false);
        setTimeout(() => {
            lancamentoInputRef.current?.focus();
            const valLength = lancamentoInputRef.current?.value.length;
            if (valLength) lancamentoInputRef.current?.setSelectionRange(valLength, valLength);
        }, 0);
    }

    const resetForm = () => { setFornecedorId(undefined); setDataVencimento(undefined); setProdutosLancados([]); setLancamentoInput(''); setNumParcelas('1'); }
    
    const handleCameraCapture = async (dataUri: string | null) => {
        if (!dataUri) { setIsCameraSheetOpen(false); return; }
        setIsParsingRomaneio(true); setIsCameraSheetOpen(false);
        toast({ title: 'A processar imagem...', description: 'Comprimindo para leitura rápida pela IA.' });
        try {
            // Nova estratégia de compressão antes do envio
            const compressedUri = await compressImage(dataUri);
            const output = await parseRomaneio({ romaneioPhoto: compressedUri });
            if (output.items && output.items.length > 0) {
                const newProdutos = output.items.map((item: any) => ({
                    id: Date.now() + Math.random(), produtoNome: item.produtoNome,
                    quantidade: item.quantidade || 1, precoUnitario: item.valorTotal / (item.quantidade || 1), preco: item.valorTotal,
                }));
                setProdutosLancados(prev => [...prev, ...newProdutos]);
                if (output.fornecedorNome) {
                    const matched = matchSupplierByName(output.fornecedorNome);
                    if (matched) setFornecedorId(matched.id);
                }
                toast({ title: 'Sucesso!', description: `${output.items.length} itens extraídos.` });
            }
        } catch (error) { 
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro na análise', description: 'Ocorreu um erro ao processar a imagem.' }); 
        } finally { setIsParsingRomaneio(false); }
    };

    const handleRomaneioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        setIsParsingRomaneio(true);
        toast({ title: "Processando...", description: `Comprimindo e lendo ${files.length} imagem(ns).` });
        for (const file of Array.from(files)) {
            try {
                const dataUri = await new Promise<string>((res, rej) => {
                    const reader = new FileReader(); reader.readAsDataURL(file);
                    reader.onload = () => res(reader.result as string); reader.onerror = e => rej(e);
                });
                const compressedUri = await compressImage(dataUri);
                const output = await parseRomaneio({ romaneioPhoto: compressedUri });
                if (output.items && output.items.length > 0) {
                    const newProdutos = output.items.map((item: any) => ({
                        id: Date.now() + Math.random(), produtoNome: item.produtoNome,
                        quantidade: item.quantidade || 1, precoUnitario: item.valorTotal / (item.quantidade || 1), preco: item.valorTotal,
                    }));
                    setProdutosLancados(prev => [...prev, ...newProdutos]);
                }
            } catch (e) { console.error(e); }
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsParsingRomaneio(false);
    };

    const totalCompra = useMemo(() => produtosLancados.reduce((acc, p) => acc + (p.preco || 0), 0), [produtosLancados]);
    const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

    return (
        <>
            <FornecedoresEditModal isOpen={isFornecedoresModalOpen} onClose={() => setIsFornecedoresModalOpen(false)} fornecedores={fornecedores || []} />
            <CameraCaptureSheet isOpen={isCameraSheetOpen} onClose={() => setIsCameraSheetOpen(false)} onCapture={handleCameraCapture} isProcessing={isParsingRomaneio} />
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleRomaneioUpload} multiple />
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Fornecedor</Label>
                        <div className='flex items-center gap-2'>
                            <Input placeholder="Adicionar novo..." value={newFornecedorName} onChange={(e) => setNewFornecedorName(e.target.value)} disabled={isAddingFornecedor} className="h-9" />
                            <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={handleAddFornecedor} disabled={isAddingFornecedor || !newFornecedorName.trim()}>{isAddingFornecedor ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}</Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={fornecedorId} onValueChange={setFornecedorId}>
                                <SelectTrigger disabled={isLoadingFornecedores}><SelectValue placeholder={isLoadingFornecedores ? "A carregar..." : "Selecione"} /></SelectTrigger>
                                <SelectContent>{fornecedores?.map(f => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}</SelectContent>
                            </Select>
                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setIsFornecedoresModalOpen(true)} disabled={isLoadingFornecedores}><Settings className="h-4 w-4" /></Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2"><Label>Vencimento</Label><DatePicker date={dataVencimento} setDate={setDataVencimento} /></div>
                       <div className="space-y-2 self-start pt-7">
                            <Label>Parcelas</Label>
                            <Select value={numParcelas} onValueChange={setNumParcelas} disabled={!dataVencimento}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map(p => (<SelectItem key={p} value={String(p)}>{p}x</SelectItem>))}</SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <Separator />
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label htmlFor='lancamento-input'>Produto (Enter vazio para Finalizar)</Label>
                         <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setIsCameraSheetOpen(true)} disabled={isParsingRomaneio}><Video className="mr-2 h-4 w-4"/>Câmara</Button>
                            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isParsingRomaneio}><Camera className="mr-2 h-4 w-4"/>Ficheiro</Button>
                        </div>
                    </div>
                     <Popover open={isSuggestionsOpen} onOpenChange={setIsSuggestionsOpen}>
                        <PopoverTrigger asChild>
                            <form onSubmit={handleAddProduto} className="flex items-start gap-2" onKeyDown={(e) => { if (e.key === 'Enter' && !lancamentoInput.trim() && produtosLancados.length > 0 && !isSubmitting) { e.preventDefault(); handleRegisterEntry(); } }}>
                                <Input id='lancamento-input' ref={lancamentoInputRef} placeholder="produto preço..." value={lancamentoInput} onChange={(e) => setLancamentoInput(e.target.value)} className='w-full' autoComplete='off' onBlur={() => setTimeout(() => setIsSuggestionsOpen(false), 150)} onFocus={() => { if (lancamentoInput.trim() !== '' && suggestions.length > 0) setIsSuggestionsOpen(true); }} />
                                <Button type="submit" size="icon" className="h-10 w-10 shrink-0"><Plus className="h-5 w-5" /></Button>
                            </form>
                        </PopoverTrigger>
                        <PopoverContent className='w-[--radix-popover-trigger-width] p-0' onOpenAutoFocus={(e) => e.preventDefault()}>
                            <ul className='max-h-60 overflow-y-auto'>{suggestions.map((suggestion, index) => (<li key={index} className='px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center justify-between gap-2' onMouseDown={() => handleSelectSuggestion(suggestion)}><span>{suggestion.name}</span><span className='font-mono text-sm text-green-500'>{formatCurrency(suggestion.lastPrice)}</span></li>))}</ul>
                        </PopoverContent>
                    </Popover>
                </div>
                {produtosLancados.length > 0 && (
                     <div className="space-y-2">
                        <div className="flex items-center justify-between"><h3 className="text-sm font-medium text-muted-foreground">Itens na Lista</h3><p className="text-xs text-muted-foreground italic">Enter vazio para finalizar</p></div>
                        <div className="flex items-stretch gap-2">
                            <ScrollArea className="rounded-md border h-48 flex-grow" viewportRef={scrollViewportRef}>
                                <div className="p-1">{produtosLancados.map(p => (
                                    <div key={p.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                                        <div className='flex flex-col'><span>{p.produtoNome}</span><span className="text-xs text-muted-foreground">{p.quantidade} x {formatCurrency(p.precoUnitario)}</span></div>
                                        <div className="flex items-center gap-2"><span className="font-mono">{formatCurrency(p.preco || 0)}</span><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setLancamentoInput(`${p.produtoNome} ${String(p.precoUnitario).replace('.', ',')}`); setProdutosLancados(prev => prev.filter(it => it.id !== p.id)); setTimeout(() => lancamentoInputRef.current?.focus(), 0); }}><Pencil className="h-4 w-4 text-blue-500" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProdutosLancados(prev => prev.filter(it => it.id !== p.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                                    </div>
                                ))}</div>
                            </ScrollArea>
                            <div className="flex flex-col justify-center gap-1"><Button variant="outline" size="icon" className="h-9 w-9" onClick={() => scrollViewportRef.current?.scrollBy({ top: -100, behavior: 'smooth' })}><ChevronUp className="h-5 w-5" /></Button><Button variant="outline" size="icon" className="h-9 w-9" onClick={() => scrollViewportRef.current?.scrollBy({ top: 100, behavior: 'smooth' })}><ChevronDown className="h-5 w-5" /></Button></div>
                        </div>
                         <div className="flex justify-end items-center gap-4 pt-2 font-semibold"><span>Total:</span><span className="text-xl text-primary">{formatCurrency(totalCompra)}</span></div>
                    </div>
                )}
                <div className="flex justify-end pt-4"><Button onClick={handleRegisterEntry} disabled={isSubmitting || produtosLancados.length === 0 || isLoadingBomboniere}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registar Entrada</Button></div>
            </div>
        </>
    );
}
