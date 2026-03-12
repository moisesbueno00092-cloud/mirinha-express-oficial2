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

    const matchSupplierByName = useCallback((name: string) => {
        if (!name || !fornecedores) return undefined;
        const searchName = name.toLowerCase();
        return fornecedores.find(f => 
            f.nome.toLowerCase().includes(searchName) || 
            searchName.includes(f.nome.toLowerCase())
        );
    }, [fornecedores]);

    const predictAndSetSupplier = useCallback((currentProdutos: LancamentoProduto[]) => {
        if (!currentProdutos.length || !allEntradas?.length || !fornecedores?.length) {
            return;
        }
    
        const supplierScores: Record<string, number> = {};
    
        for (const produto of currentProdutos) {
            const productHistory: Record<string, number> = {};
            allEntradas.forEach(entry => {
                if (entry.produtoNome.toLowerCase() === produto.produtoNome.toLowerCase()) {
                    productHistory[entry.fornecedorId] = (productHistory[entry.fornecedorId] || 0) + 1;
                }
            });
    
            if (Object.keys(productHistory).length > 0) {
                const mostLikelySupplierForProduct = Object.entries(productHistory).reduce((a, b) => a[1] > b[1] ? a : b)[0];
                if (mostLikelySupplierForProduct) {
                    supplierScores[mostLikelySupplierForProduct] = (supplierScores[mostLikelySupplierForProduct] || 0) + 1;
                }
            }
        }
        
        if (Object.keys(supplierScores).length === 0) {
            return;
        }
    
        const bestMatchId = Object.entries(supplierScores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
        
        if (bestMatchId && fornecedores.some(f => f.id === bestMatchId)) {
            setFornecedorId(bestMatchId);
            const fornecedorNome = fornecedores.find(f => f.id === bestMatchId)?.nome;
            toast({
                title: "Fornecedor Sugerido",
                description: `Com base nos produtos, selecionámos "${fornecedorNome}".`,
            });
        }
    
    }, [allEntradas, fornecedores, toast]);


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
                const batch = writeBatch(firestore);
                fornecedoresToUpdate.forEach(f => {
                    const docRef = doc(firestore, 'fornecedores', f.id);
                    batch.update(docRef, { color: generateStrongColor() });
                });
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
    
    const handleScroll = (direction: 'up' | 'down') => {
        if (scrollViewportRef.current) {
            const scrollAmount = 100;
            scrollViewportRef.current.scrollBy({
                top: direction === 'up' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    const handleAddFornecedor = async () => {
        if (!firestore || !newFornecedorName.trim()) return;

        setIsAddingFornecedor(true);
        try {
            const newColor = generateStrongColor();
            const newFornecedor = {
                nome: newFornecedorName.trim(),
                color: newColor
            };
            await addDoc(collection(firestore, 'fornecedores'), newFornecedor);
            toast({ title: 'Sucesso', description: 'Fornecedor adicionado.' });
            setNewFornecedorName('');
        } catch (error) {
            console.error("Erro ao adicionar fornecedor: ", error);
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível adicionar o fornecedor.' });
        } finally {
            setIsAddingFornecedor(false);
        }
    };
    
    const handleRegisterEntry = async () => {
        if (!firestore || produtosLancados.length === 0 || isLoadingBomboniere) {
            if (produtosLancados.length === 0) {
                toast({ variant: 'destructive', title: 'Lista vazia', description: 'Adicione pelo menos um produto antes de registar.' });
            }
            return;
        }
        setIsSubmitting(true);
        
        const romaneioId = doc(collection(firestore, '_')).id;
        const finalFornecedorId = fornecedorId || 'extra_expenses_provider';

        try {
            const vencimentoBase = dataVencimento || new Date();
            const estaPaga = !dataVencimento;
            const parcelas = estaPaga ? 1 : parseInt(numParcelas, 10);

            const valorParcela = totalCompra / parcelas;
            const batch = writeBatch(firestore);

            const nomesProdutos = produtosLancados.map(p => {
                const qtyPrefix = p.quantidade > 1 ? `${p.quantidade}x ` : '';
                return `${qtyPrefix}${p.produtoNome}`;
            }).join(', ');
            
            const displayDescription = nomesProdutos.length > 100 ? nomesProdutos.substring(0, 97) + '...' : nomesProdutos;

            for (let i = 0; i < parcelas; i++) {
                const vencimentoParcela = estaPaga ? vencimentoBase : addDays(vencimentoBase, i * 7);
                const novaConta: Omit<ContaAPagar, 'id'> = {
                    descricao: `${displayDescription} ${parcelas > 1 ? `(${i + 1}/${parcelas})` : ''}`.trim(),
                    fornecedorId: finalFornecedorId,
                    valor: valorParcela,
                    dataVencimento: formatDateFn(vencimentoParcela, 'yyyy-MM-dd'),
                    estaPaga: estaPaga,
                    romaneioId: romaneioId,
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
                    romaneioId: romaneioId,
                };
                const entradaDocRef = doc(collection(firestore, 'entradas_mercadorias'));
                batch.set(entradaDocRef, novaEntrada);
                
                const matchedBomboniereItem = findBestBomboniereMatch(produto.produtoNome, bomboniereItems || []);
                if (matchedBomboniereItem) {
                    const bomboniereDocRef = doc(firestore, 'bomboniere_items', matchedBomboniereItem.id);
                    const currentStock = bomboniereItems?.find(bi => bi.id === matchedBomboniereItem.id)?.estoque ?? 0;
                    const newStock = currentStock + produto.quantidade;
                    batch.update(bomboniereDocRef, { estoque: newStock });
                }
            }
            
            await batch.commit();

            toast({ 
                title: estaPaga ? 'Lançamento à Vista Realizado!' : 'Compra Parcelada Registada!', 
                description: estaPaga 
                    ? `A compra de ${formatCurrency(totalCompra)} foi registada como paga hoje.` 
                    : `Entrada de mercadoria e ${parcelas} conta(s) a pagar criadas.` 
            });
            resetForm();
        } catch (error) {
            console.error("Erro ao registar entrada:", error);
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível registar a entrada.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleAddProduto = (e?: React.FormEvent) => {
        e?.preventDefault();
        
        const input = lancamentoInput.trim();
        if (!input) {
            if (produtosLancados.length > 0 && !isSubmitting) {
                handleRegisterEntry();
            }
            return;
        }

        let precoUnitario = 0;
        let quantidade = 1;
        let precoTotal = 0;
        let produtoNomeFinal = "";
        
        const isNumeric = (str: string) => !isNaN(parseFloat(str.replace(',', '.'))) && /^[0-9,.]+$/.test(str);

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
            const lastSpaceIndex = input.lastIndexOf(' ');
            if (lastSpaceIndex > -1 && lastSpaceIndex < input.length - 1) {
                const potentialPrice = input.substring(lastSpaceIndex + 1);
                if (isNumeric(potentialPrice)) {
                    const nomeParte = input.substring(0, lastSpaceIndex).trim();
                    precoUnitario = parseFloat(potentialPrice.replace(',', '.'));
                    
                    const qtyRegex = /^(.*)\s+(\d+)(un|kg)$/i;
                    const qtyMatch = nomeParte.match(qtyRegex);

                    if (qtyMatch && !/\s/.test(qtyMatch[2]+qtyMatch[3])) {
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
    
    const processFlowOutput = useCallback((output: any) => {
        const { items, fornecedorNome, dataVencimento: aiDueDate } = output;

        if (items && items.length > 0) {
            const newProdutos: LancamentoProduto[] = items.map((item: any) => {
                const valorTotal = item.valorTotal;
                const quantidade = item.quantidade > 0 ? item.quantidade : 1;
                const precoUnitario = valorTotal / quantidade;
                return {
                    id: Date.now() + Math.random(),
                    produtoNome: item.produtoNome,
                    quantidade, precoUnitario, preco: valorTotal,
                };
            });
            
            setProdutosLancados(prev => {
                const newList = [...prev, ...newProdutos];
                if (!fornecedorNome) {
                    predictAndSetSupplier(newList);
                }
                return newList;
            });
        }

        if (fornecedorNome) {
            const matchedSupplier = matchSupplierByName(fornecedorNome);
            if (matchedSupplier) {
                setFornecedorId(matchedSupplier.id);
                toast({ title: 'Fornecedor Reconhecido', description: `Selecionámos "${matchedSupplier.nome}" automaticamente.` });
            } else {
                setNewFornecedorName(fornecedorNome);
                toast({ title: 'Novo Fornecedor?', description: `A IA detetou "${fornecedorNome}" no documento.` });
            }
        }

        if (aiDueDate) {
            const parsedDate = parseISO(aiDueDate);
            if (isValid(parsedDate)) {
                setDataVencimento(parsedDate);
                toast({ title: 'Vencimento Identificado', description: `Data de vencimento ajustada para ${formatDateFn(parsedDate, 'dd/MM/yyyy')}.` });
            }
        }
    }, [matchSupplierByName, predictAndSetSupplier, toast]);

    const handleCameraCapture = async (dataUri: string | null) => {
        if (!dataUri) {
            setIsCameraSheetOpen(false);
            return;
        }

        setIsParsingRomaneio(true);
        setIsCameraSheetOpen(false);
        toast({ title: 'A processar imagem...', description: 'A extrair itens, fornecedor e vencimento. Isto pode demorar um momento.' });

        try {
            const compressedUri = await compressImage(dataUri, 0.85);
            const output = await parseRomaneio({ romaneioPhoto: compressedUri });

            if (!output.items || output.items.length === 0) {
                toast({ variant: 'destructive', title: 'Nenhum item encontrado', description: 'A IA não conseguiu extrair itens da imagem fornecida.' });
            } else {
                processFlowOutput(output);
                toast({ title: 'Sucesso!', description: `${output.items.length} itens foram extraídos e adicionados.` });
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
        if (!isParsingRomaneio) {
            setIsParsingRomaneio(true);
        } else {
            return;
        }

        const files = event.target.files;
        if (!files || files.length === 0) {
            setIsParsingRomaneio(false);
            return;
        }

        toast({
            title: "Processamento em Lote...",
            description: `A processar ${files.length} imagem(ns). Isto pode demorar vários minutos.`,
            duration: (files.length + 1) * 60000
        });

        let hasAnySuccess = false;

        for (const [index, file] of Array.from(files).entries()) {
            toast({
                title: `A processar imagem ${index + 1} de ${files.length}...`,
                description: file.name,
                duration: 120000
            });
            try {
                const dataUri = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = error => reject(error);
                });

                const compressedUri = await compressImage(dataUri, 0.85);
                const output = await parseRomaneio({ romaneioPhoto: compressedUri });

                if (output.items && output.items.length > 0) {
                    hasAnySuccess = true;
                    processFlowOutput(output);
                }
            } catch (error: any) {
                const errorMessage = error.message.includes('429')
                    ? "Limite de IA atingido e tentativas esgotadas."
                    : (error.message || `Não foi possível processar: ${file.name}`);
                toast({
                    variant: 'destructive',
                    title: `Erro na Imagem ${index + 1}`,
                    description: errorMessage,
                    duration: 10000
                });
            } finally {
                if (index < files.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 61000));
                }
            }
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }

        if (hasAnySuccess) {
            toast({
                title: "Processamento Finalizado",
                description: "Leitura concluída com sucesso.",
            });
        } else {
            toast({
                variant: "destructive",
                title: "Processamento Finalizado Sem Sucesso",
                description: "Nenhum item foi extraído. Verifique os erros e tente novamente.",
            });
        }
        setIsParsingRomaneio(false);
    };

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
                            <p className="text-xs text-muted-foreground">Deixe em branco para pagamento à vista (hoje).</p>
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
                            <form 
                                onSubmit={handleAddProduto} 
                                className="flex items-start gap-2"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !lancamentoInput.trim() && produtosLancados.length > 0 && !isSubmitting) {
                                        e.preventDefault();
                                        handleRegisterEntry();
                                    }
                                }}
                            >
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
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-muted-foreground">Produtos nesta Entrada</h3>
                            <p className="text-xs text-muted-foreground italic">(Pressione Enter no campo vazio para finalizar)</p>
                        </div>
                        <div className="flex items-stretch gap-2">
                            <ScrollArea className="rounded-md border h-48 flex-grow" viewportRef={scrollViewportRef}>
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
                            <div className="flex flex-col justify-center gap-1">
                                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleScroll('up')}>
                                    <ChevronUp className="h-5 w-5" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleScroll('down')}>
                                    <ChevronDown className="h-5 w-5" />
                                </Button>
                            </div>
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
