
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc, setDoc, addDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ContaAPagar, EntradaMercadoria, Fornecedor, ParsedRomaneioItem, BomboniereItem } from '@/types';
import { parseRomaneio } from '@/ai/flows/parse-romaneio-flow';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, PlusCircle, Trash2, Pencil, Settings, Camera, Video } from 'lucide-react';
import { Separator } from '../ui/separator';
import { format as formatDateFn, addDays } from 'date-fns';
import { DatePicker } from '../ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import FornecedoresEditModal from './fornecedores-edit-modal';
import { ScrollArea } from '../ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import CameraCaptureSheet from './camera-capture-sheet';


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

const generateStrongColor = () => {
  const h = Math.floor(Math.random() * 360);
  const s = Math.floor(Math.random() * 20) + 80; // Saturation: 80% to 100%
  const l = Math.floor(Math.random() * 20) + 65; // Lightness: 65% to 85% for better brightness and vibrancy
  return `hsl(${h}, ${s}%, ${l}%)`;
};

const findBestBomboniereMatch = (productName: string, bomboniereItems: BomboniereItem[]): BomboniereItem | undefined => {
    if (!productName || !bomboniereItems) return undefined;

    const lowerProductName = productName.toLowerCase();
    let bestMatch: BomboniereItem | undefined = undefined;
    let longestMatchLength = 0;

    for (const bomboniereItem of bomboniereItems) {
        // Normalize bomboniere name by removing content in parentheses
        const baseBomboniereName = bomboniereItem.name.toLowerCase().replace(/\s*\(.*\)\s*/, '').trim();

        if (!baseBomboniereName) continue;
        
        // Check if the invoice product name starts with the base bomboniere name
        if (lowerProductName.startsWith(baseBomboniereName)) {
            // We want the longest possible match to avoid "bala" matching "bala de goma" incorrectly.
            if (baseBomboniereName.length > longestMatchLength) {
                bestMatch = bomboniereItem;
                longestMatchLength = baseBomboniereName.length;
            }
        }
    }

    return bestMatch;
};

const compressImage = (dataUri: string, quality: number, maxWidth: number = 1920): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Failed to get canvas context'));
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (err) => reject(err);
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
                const providerExists = fornecedores.some(f => f.id === provider.id);
                if (!providerExists) {
                    const docRef = doc(firestore, 'fornecedores', provider.id);
                    batch.set(docRef, { nome: provider.name, color: provider.color });
                    needsCommit = true;
                }
            }

            if (needsCommit) {
                await batch.commit();
            }
        };
        ensureProviders();
    }, [firestore, fornecedores, isLoadingFornecedores]);

    useEffect(() => {
        const assignMissingColors = async () => {
            if (!firestore || !fornecedores || fornecedores.length === 0) return;

            const fornecedoresToUpdate = fornecedores.filter(f => !f.color);

            if (fornecedoresToUpdate.length > 0) {
                console.log(`Found ${fornecedoresToUpdate.length} suppliers without colors. Updating them...`);
                const batch = writeBatch(firestore);
                fornecedoresToUpdate.forEach(f => {
                    const docRef = doc(firestore, 'fornecedores', f.id);
                    batch.update(docRef, { color: generateStrongColor() });
                });
                await batch.commit();
                console.log("Suppliers updated with new colors.");
            }
        };

        assignMissingColors();
    }, [firestore, fornecedores]);
    
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
    
    useEffect(() => {
        if (scrollViewportRef.current) {
            scrollViewportRef.current.scrollTo({
                top: scrollViewportRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [produtosLancados]);
    
    const handleAddFornecedor = async () => {
        if (!firestore || !newFornecedorName.trim()) return;

        setIsAddingFornecedor(true);
        try {
            const newColor = generateStrongColor();
            const newFornecedor = {
                nome: newFornecedorName.trim(),
                color: newColor
            };
            const docRef = await addDoc(collection(firestore, 'fornecedores'), newFornecedor);
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
        let precoUnitario = 0;
        let quantidade = 1;
        let precoTotal = 0;
        let produtoNomeFinal = "";
        
        const isNumeric = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);

        // Nova lógica: [desc] un/kg [qtd] [preco_unit]
        const unitRegex = /^(.*?)\s*(un|kg)\s+([\d,.]+)\s+([\d,.]+)$/i;
        const unitMatch = input.match(unitRegex);

        if (unitMatch) {
            const [, desc, unit, qtyStr, priceStr] = unitMatch;
            quantidade = parseFloat(qtyStr.replace(',', '.'));
            precoUnitario = parseFloat(priceStr.replace(',', '.'));
            
            if (isNaN(quantidade) || isNaN(precoUnitario)) {
                toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Quantidade ou preço após a sigla são inválidos.'});
                return;
            }

            precoTotal = quantidade * precoUnitario;
            produtoNomeFinal = `${desc} ${unit}`.trim();

        } else {
            // Lógica antiga (fallback)
            const lastSpaceIndex = input.lastIndexOf(' ');
            if (lastSpaceIndex > -1 && lastSpaceIndex < input.length - 1) {
                const potentialPrice = input.substring(lastSpaceIndex + 1);
                if (isNumeric(potentialPrice)) {
                    nomeParte = input.substring(0, lastSpaceIndex).trim();
                    precoUnitario = parseFloat(potentialPrice.replace(',', '.'));
                    
                    const qtyRegex = /^(.*)\s+(\d+)(un|kg)$/i;
                    const qtyMatch = nomeParte.match(qtyRegex);

                    if (qtyMatch && !/\s/.test(qtyMatch[2]+qtyMatch[3])) { // Check no space for old logic
                        produtoNomeFinal = qtyMatch[1].trim();
                        quantidade = parseInt(qtyMatch[2], 10);
                    } else {
                         produtoNomeFinal = nomeParte;
                         quantidade = 1;
                    }
                    precoTotal = quantidade * precoUnitario;
                } else {
                     toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Formato não reconhecido. Use: <Nome> <Preço> ou <Desc> kg/un <Qtd> <Preço Unit>.'});
                    return;
                }
            } else {
                 toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Preço do produto não encontrado.'});
                return;
            }
        }
        
        if (isNaN(precoTotal) || precoTotal <= 0) {
            toast({ variant: 'destructive', title: 'Entrada inválida', description: 'O cálculo final do preço é inválido.' });
            return;
        }

        if (!produtoNomeFinal.trim()) {
             toast({ variant: 'destructive', title: 'Entrada inválida', description: 'Nome do produto não pode ser vazio.' });
            return;
        }
        
        setProdutosLancados(prev => [...prev, {
            id: Date.now(),
            produtoNome: produtoNomeFinal, 
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
        // This is complex now with the new logic. For now, just remove and let user re-enter.
        // A better implementation would require reversing the logic.
        // For simplicity, we just put the raw name and unit price back.
        const inputToEdit = `${produto.produtoNome} ${String(produto.precoUnitario).replace('.', ',')}`;
        
        setLancamentoInput(inputToEdit);
        handleRemoveProduto(produto.id);
        setTimeout(() => lancamentoInputRef.current?.focus(), 0);
    }

    const resetForm = () => {
        setFornecedorId(undefined);
        setDataVencimento(undefined);
        setProdutosLancados([]);
        setLancamentoInput('');
        setNumParcelas('1');
    }
    
    const handleCameraCapture = async (dataUri: string | null) => {
        if (!dataUri) {
            setIsCameraSheetOpen(false);
            return;
        }

        setIsParsingRomaneio(true);
        setIsCameraSheetOpen(false);
        toast({ title: 'A processar imagem...', description: 'A extrair itens da foto. Isto pode demorar um momento.' });

        try {
            const compressedUri = await compressImage(dataUri, 0.85);
            const { items } = await parseRomaneio({ romaneioPhoto: compressedUri });

            if (items.length === 0) {
                toast({ variant: 'destructive', title: 'Nenhum item encontrado', description: 'A IA não conseguiu extrair itens da imagem fornecida.' });
            } else {
                const newProdutos: LancamentoProduto[] = items.map(item => {
                    const valorTotal = item.valorTotal;
                    const quantidade = item.quantidade > 0 ? item.quantidade : 1;
                    const precoUnitario = valorTotal / quantidade;
                    return {
                        id: Date.now() + Math.random(),
                        produtoNome: item.produtoNome,
                        quantidade, precoUnitario, preco: valorTotal,
                    };
                });

                setProdutosLancados(prev => [...prev, ...newProdutos]);
                toast({ title: 'Sucesso!', description: `${newProdutos.length} itens foram extraídos e adicionados.` });

                if (firestore && bomboniereItems?.length) {
                    const batch = writeBatch(firestore);
                    let stockUpdates = 0;
                    for (const produto of newProdutos) {
                        const matched = findBestBomboniereMatch(produto.produtoNome, bomboniereItems);
                        if (matched) {
                            const itemRef = doc(firestore, 'bomboniere_items', matched.id);
                            const newStock = (matched.estoque || 0) + produto.quantidade;
                            batch.update(itemRef, { estoque: newStock });
                            stockUpdates++;
                        }
                    }
                    if (stockUpdates > 0) {
                        await batch.commit();
                        toast({ title: 'Estoque Atualizado', description: `${stockUpdates} item(ns) da bomboniere tiveram o estoque atualizado.` });
                    }
                }
            }
        } catch (error: any) {
            console.error("Erro ao analisar a imagem da câmera:", error);
            const errorMessage = error.message.includes('429')
                ? "Limite de IA atingido e tentativas esgotadas."
                : (error.message || 'Não foi possível extrair os itens da imagem.');
            toast({ variant: 'destructive', title: 'Erro de Análise', description: errorMessage });
        } finally {
            setIsParsingRomaneio(false);
        }
    };

    const handleRomaneioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0 || isParsingRomaneio) return;
    
        setIsParsingRomaneio(true);
        toast({ title: "Processamento em Lote...", description: `A processar ${files.length} imagem(ns). Este processo pode demorar vários minutos.`, duration: (files.length + 1) * 60000 });
    
        let totalItemsAdded = 0;
        let hasAnySuccess = false;

        for (const [index, file] of Array.from(files).entries()) {
            toast({ title: `A processar imagem ${index + 1} de ${files.length}...`, description: file.name, duration: 120000 });
            try {
                const dataUri = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = (error) => reject(error);
                });
    
                const compressedUri = await compressImage(dataUri, 0.85);
                const { items } = await parseRomaneio({ romaneioPhoto: compressedUri });
    
                if (items.length > 0) {
                    hasAnySuccess = true;
                    const newProdutos: LancamentoProduto[] = items.map(item => {
                        const valorTotal = item.valorTotal;
                        const quantidade = item.quantidade > 0 ? item.quantidade : 1;
                        const precoUnitario = valorTotal / quantidade;
                        return {
                            id: Date.now() + Math.random(),
                            produtoNome: item.produtoNome,
                            quantidade, precoUnitario, preco: valorTotal
                        };
                    });
    
                    totalItemsAdded += newProdutos.length;
                    setProdutosLancados(prev => [...prev, ...newProdutos]);
    
                    if (firestore && bomboniereItems?.length) {
                        const batch = writeBatch(firestore);
                        let stockUpdatesCount = 0;
                        for (const produto of newProdutos) {
                            const matchedItem = findBestBomboniereMatch(produto.produtoNome, bomboniereItems);
                            if (matchedItem) {
                                const docRef = doc(firestore, 'bomboniere_items', matchedItem.id);
                                const currentStock = bomboniereItems.find(bi => bi.id === matchedItem.id)?.estoque ?? 0;
                                const newStock = currentStock + produto.quantidade;
                                batch.update(docRef, { estoque: newStock });
                                stockUpdatesCount++;
                            }
                        }
                        if (stockUpdatesCount > 0) {
                            await batch.commit();
                            toast({
                                title: `Estoque Atualizado (${file.name})`,
                                description: `${stockUpdatesCount} item(ns) da bomboniere tiveram o estoque atualizado.`
                            });
                        }
                    }
                }
            } catch (error: any) {
                console.error(`Error processing image ${file.name}:`, error);
                const errorMessage = error.message.includes('429')
                    ? "Limite de IA atingido e tentativas esgotadas."
                    : (error.message || `Não foi possível processar: ${file.name}`);
                toast({ variant: 'destructive', title: `Erro na Imagem ${index + 1}`, description: errorMessage, duration: 10000 });
            }
        }
        
        setIsParsingRomaneio(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        
        if (hasAnySuccess) {
            toast({ title: "Processamento finalizado.", description: `${totalItemsAdded} item(ns) adicionado(s).` });
        } else {
             toast({ variant: "destructive", title: "Processamento finalizado sem sucesso.", description: "Nenhum item foi extraído. Verifique os erros e tente novamente." });
        }
    };

    const handleRegisterEntry = async () => {
        if (!firestore || produtosLancados.length === 0 || isLoadingBomboniere) {
            toast({ variant: 'destructive', title: 'Faltam dados', description: 'Por favor, adicione pelo menos um produto e espere os itens da bomboniere carregarem.' });
            return;
        }
        setIsSubmitting(true);
        
        const finalFornecedorId = fornecedorId || 'extra_expenses_provider';

        try {
            const fornecedorNome = fornecedores?.find(f => f.id === finalFornecedorId)?.nome || 'Fornecedor desconhecido';
            const parcelas = parseInt(numParcelas, 10);
            
            const vencimentoBase = dataVencimento || new Date();
            const estaPaga = !dataVencimento;

            const valorParcela = totalCompra / parcelas;
            
            const batch = writeBatch(firestore);

            for (let i = 0; i < parcelas; i++) {
                const vencimentoParcela = addDays(vencimentoBase, i * 7);
                const novaConta: Omit<ContaAPagar, 'id'> = {
                    descricao: `Compra de mercadorias - ${fornecedorNome} (${i + 1}/${parcelas})`,
                    fornecedorId: finalFornecedorId,
                    valor: valorParcela,
                    dataVencimento: formatDateFn(vencimentoParcela, 'yyyy-MM-dd'),
                    estaPaga: estaPaga,
                };
                const contaDocRef = doc(collection(firestore, 'contas_a_pagar'));
                batch.set(contaDocRef, novaConta);
            }

            for (const produto of produtosLancados) {
                const novaEntrada: Omit<EntradaMercadoria, 'id'> = {
                    produtoNome: produto.produtoNome,
                    fornecedorId: finalFornecedorId,
                    data: new Date().toISOString(),
                    quantidade: produto.quantidade,
                    precoUnitario: produto.precoUnitario,
                    valorTotal: produto.preco,
                    estaPaga: estaPaga,
                };
                const entradaDocRef = doc(collection(firestore, 'entradas_mercadorias'));
                batch.set(entradaDocRef, novaEntrada);
                
                // Stock update logic
                const matchedBomboniereItem = findBestBomboniereMatch(produto.produtoNome, bomboniereItems || []);
                if (matchedBomboniereItem) {
                    const bomboniereDocRef = doc(firestore, 'bomboniere_items', matchedBomboniereItem.id);
                    // Get the most recent stock value to avoid race conditions if items are re-fetched
                    const currentStock = bomboniereItems?.find(bi => bi.id === matchedBomboniereItem.id)?.estoque ?? 0;
                    const newStock = currentStock + produto.quantidade;
                    batch.update(bomboniereDocRef, { estoque: newStock });
                }
            }
            
            await batch.commit();

            toast({ title: 'Sucesso!', description: 'Entrada de mercadoria, conta(s) a pagar e estoque atualizados com sucesso.' });
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
             <CameraCaptureSheet
                isOpen={isCameraSheetOpen}
                onClose={() => setIsCameraSheetOpen(false)}
                onCapture={handleCameraCapture}
                isProcessing={isParsingRomaneio}
            />
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleRomaneioUpload}
                multiple
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
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                            <Label htmlFor="vencimento">Vencimento da 1ª Parcela</Label>
                            <DatePicker date={dataVencimento} setDate={setDataVencimento} />
                            <p className="text-xs text-muted-foreground">Deixe em branco para pagamento à vista.</p>
                        </div>
                         <div className="space-y-2 self-start pt-7">
                            <Label htmlFor="parcelas">Nº de Parcelas</Label>
                            <Select value={numParcelas} onValueChange={setNumParcelas} disabled={!dataVencimento}>
                                <SelectTrigger id="parcelas">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(p => (
                                        <SelectItem key={p} value={String(p)}>{p}x</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             <p className="text-xs text-muted-foreground">Ativo se data for selecionada.</p>
                        </div>
                    </div>
                </div>
                
                <Separator />

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label htmlFor='lancamento-input'>Lançamento de Produto</Label>
                         <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsCameraSheetOpen(true)}
                                disabled={isParsingRomaneio}
                            >
                                {isParsingRomaneio ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Video className="mr-2 h-4 w-4"/>}
                                Usar Câmera
                            </Button>
                             <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isParsingRomaneio}
                            >
                                {isParsingRomaneio ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Camera className="mr-2 h-4 w-4"/>}
                                Ler Romaneio
                            </Button>
                            <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Settings className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                                <SheetHeader>
                                <SheetTitle>Formatos de Lançamento de Mercadorias</SheetTitle>
                                <SheetDescription>
                                    Utilize os formatos abaixo para registar os produtos comprados.
                                </SheetDescription>
                                </SheetHeader>
                                <div className="py-4">
                                    <ul className="list-disc pl-5 space-y-4 mt-2 text-sm">
                                        <li>
                                            <span className="font-semibold text-foreground">Item único com preço total:</span>
                                            <p className="text-muted-foreground">Regista um único item com o seu valor total.</p>
                                            <p className="font-mono text-muted-foreground mt-1 p-2 bg-muted rounded-md">Ex: Caixa de Tomate 55,00</p>
                                        </li>
                                        <li>
                                            <span className="font-semibold text-foreground">Múltiplos itens ou por peso:</span>
                                            <p className="text-muted-foreground">Formato: (Produto + "un" ou "kg" + Quantidade + Preço Unitário)</p>
                                            <p className="font-mono text-muted-foreground mt-1 p-2 bg-muted rounded-md">Ex: Queijo kg 2 35</p>
                                            <p className='text-xs text-muted-foreground'>(Isto regista 2kg de Queijo a 35,00/kg, totalizando 70,00)</p>
                                            <p className="font-mono text-muted-foreground mt-2 p-2 bg-muted rounded-md">Ex: Coca-cola un 12 8,50</p>
                                            <p className='text-xs text-muted-foreground'>(Isto regista 12 unidades de Coca-cola a 8,50/un, totalizando 102,00)</p>
                                        </li>
                                    </ul>
                                </div>
                            </SheetContent>
                            </Sheet>
                        </div>
                    </div>
                     <Popover open={isSuggestionsOpen} onOpenChange={setIsSuggestionsOpen}>
                        <PopoverTrigger asChild>
                            <form onSubmit={handleAddProduto} className="flex items-start gap-2">
                                <Input
                                    id='lancamento-input'
                                    ref={lancamentoInputRef}
                                    placeholder="adicionar produtos..."
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
                        <ScrollArea className="rounded-md border h-48" viewportRef={scrollViewportRef}>
                            <div className="p-1">
                                {produtosLancados.map(p => (
                                    <div key={p.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                                        <div className='flex flex-col'>
                                            <span>{p.produtoNome}</span>
                                            <span className="text-xs text-muted-foreground">{p.quantidade} x {formatCurrency(p.precoUnitario)}</span>
                                        </div>
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
                        </ScrollArea>
                         <div className="flex justify-end items-center gap-4 pt-2 font-semibold">
                            <span>Total da Compra:</span>
                            <span className="text-xl text-primary">{formatCurrency(totalCompra)}</span>
                        </div>
                    </div>
                )}


                <div className="flex justify-end pt-4">
                    <Button 
                        onClick={handleRegisterEntry}
                        disabled={isSubmitting || produtosLancados.length === 0 || isLoadingBomboniere}
                    >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Registar Entrada e Criar Conta(s)
                    </Button>
                </div>

            </div>
        </>
    );
}
