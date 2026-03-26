
'use client';

import { useState, useMemo, useRef } from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Fornecedor, BomboniereItem } from '@/types';
import { parseRomaneio } from '@/ai/flows/parse-romaneio-flow';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileImage, Trash2, Save, Upload } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { format as formatDateFn, addDays } from 'date-fns';
import { DatePicker } from '../ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface LancamentoProduto {
    id: number;
    produtoNome: string;
    preco: number;
    quantidade: number;
    precoUnitario: number;
}

/**
 * Função de Compressão de Imagem no Cliente
 * Reduz o peso da imagem (Max 1600px) e qualidade 0.8 para evitar erro de 1MB e acelerar IA.
 */
const compressImage = (dataUri: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1600;
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
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = dataUri;
    });
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

export default function MercadoriasPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [fornecedorId, setFornecedorId] = useState<string | undefined>(undefined);
    const [dataVencimento, setDataVencimento] = useState<Date | undefined>(undefined);
    const [produtosLancados, setProdutosLancados] = useState<LancamentoProduto[]>([]);
    const [numParcelas, setNumParcelas] = useState('1');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isParsingRomaneio, setIsParsingRomaneio] = useState(false);
    const [lancamentoInput, setLancamentoInput] = useState('');
    
    const lancamentoInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fornecedoresQuery = useMemo(() => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null, [firestore]);
    const { data: fornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);
    const { data: bomboniereItems } = useCollection<BomboniereItem>(bomboniereItemsQuery);

    const handleRegisterEntry = async () => {
        if (!firestore || produtosLancados.length === 0 || isSubmitting) return;
        setIsSubmitting(true);
        const romaneioId = doc(collection(firestore, '_')).id;
        const finalFornecedorId = fornecedorId || 'extra_expenses_provider';
        try {
            const batch = writeBatch(firestore);
            const totalCompra = produtosLancados.reduce((acc, p) => acc + p.preco, 0);
            const estaPaga = !dataVencimento;
            const parcelas = estaPaga ? 1 : parseInt(numParcelas, 10);
            const valorParcela = totalCompra / parcelas;

            for (let i = 0; i < parcelas; i++) {
                const vencimentoParcela = estaPaga ? new Date() : addDays(dataVencimento!, i * 7);
                batch.set(doc(collection(firestore, 'contas_a_pagar')), {
                    descricao: `Compra Mercadorias ${parcelas > 1 ? `(${i + 1}/${parcelas})` : ''}`.trim(),
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
                const matched = findBestBomboniereMatch(produto.produtoNome, bomboniereItems || []);
                if (matched) {
                    batch.update(doc(firestore, 'bomboniere_items', matched.id), { estoque: matched.estoque + produto.quantidade });
                }
            }
            await batch.commit();
            toast({ title: 'Sucesso!', description: 'Lançamento realizado.' });
            setProdutosLancados([]); setFornecedorId(undefined); setDataVencimento(undefined);
        } catch (error) { toast({ variant: 'destructive', title: 'Erro ao salvar' }); } finally { setIsSubmitting(false); }
    };

    const handleAddProduto = (e?: React.FormEvent) => {
        e?.preventDefault();
        const input = lancamentoInput.trim();
        if (!input) {
            if (produtosLancados.length > 0 && !isSubmitting) handleRegisterEntry();
            return;
        }
        const lastSpace = input.lastIndexOf(' ');
        if (lastSpace > -1) {
            const price = parseFloat(input.substring(lastSpace + 1).replace(',', '.'));
            if (!isNaN(price)) {
                setProdutosLancados(prev => [...prev, { id: Date.now(), produtoNome: input.substring(0, lastSpace), preco: price, quantidade: 1, precoUnitario: price }]);
                setLancamentoInput('');
            }
        }
    };

    const processPhoto = async (dataUri: string) => {
        setIsParsingRomaneio(true);
        try {
            const compressed = await compressImage(dataUri);
            const output = await parseRomaneio({ romaneioPhoto: compressed });
            if (output && output.items) {
                setProdutosLancados(prev => [
                    ...prev, 
                    ...output.items.map((it: any) => ({ 
                        id: Math.random(), 
                        produtoNome: it.produtoNome, 
                        preco: it.valorTotal, 
                        quantidade: it.quantidade, 
                        precoUnitario: it.valorTotal / it.quantidade 
                    }))
                ]);
                toast({ title: "Leitura Concluída", description: `${output.items.length} produtos identificados.` });
            }
            if (output && output.fornecedorNome) {
                const matchedFornecedor = fornecedores?.find(f => f.nome.toLowerCase().includes(output.fornecedorNome!.toLowerCase()));
                if (matchedFornecedor) setFornecedorId(matchedFornecedor.id);
            }
        } catch (e) { 
            console.error("Erro ao processar romaneio:", e);
            toast({ variant: 'destructive', title: 'Erro na leitura', description: 'Não foi possível extrair os dados da imagem. Verifique a conexão com a IA.' }); 
        } finally { 
            setIsParsingRomaneio(false); 
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUri = event.target?.result as string;
            processPhoto(dataUri);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleRemoveItem = (id: number) => {
        setProdutosLancados(prev => prev.filter(p => p.id !== id));
    };

    const totalCompra = useMemo(() => produtosLancados.reduce((acc, p) => acc + p.preco, 0), [produtosLancados]);

    return (
        <div className="space-y-6">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Fornecedor</Label>
                    <Select value={fornecedorId} onValueChange={setFornecedorId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                        <SelectContent>
                            {fornecedores?.map(f => (
                                <SelectItem key={f.id} value={f.id} style={{ color: f.color }}>
                                    {f.nome}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Vencimento (Vazio = Pago hoje)</Label>
                    <DatePicker date={dataVencimento} setDate={setDataVencimento} />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Carregar Romaneio JPG/PNG do PC (IA)</Label>
                <div className="flex flex-col gap-3">
                    <Button 
                        variant="outline" 
                        size="lg"
                        className="w-full h-16 gap-3 border-dashed border-2 border-primary/50 hover:border-primary hover:bg-primary/5 text-lg"
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isParsingRomaneio}
                    >
                        {isParsingRomaneio ? <Loader2 className="h-6 w-6 animate-spin text-primary"/> : <Upload className="h-6 w-6 text-primary"/>}
                        <span>{isParsingRomaneio ? 'A Processar Imagem...' : 'Escolher Foto do Computador'}</span>
                    </Button>
                    
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-muted" /></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">ou introdução manual</span></div>
                    </div>

                    <div className="relative flex-grow">
                        <Input 
                            ref={lancamentoInputRef} 
                            placeholder="produto preço..." 
                            value={lancamentoInput} 
                            onChange={(e) => setLancamentoInput(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && handleAddProduto()} 
                            disabled={isParsingRomaneio}
                            className="h-10"
                        />
                    </div>
                </div>
                <p className="text-[0.65rem] text-muted-foreground italic">Dica: Digite "produto valor" e Enter para adicionar à lista. Enter vazio finaliza o registo.</p>
            </div>

            {produtosLancados.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted px-3 py-1 text-[0.65rem] font-bold uppercase flex justify-between">
                        <span>Produtos na Lista</span>
                        <span>Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCompra)}</span>
                    </div>
                    <ScrollArea className="h-48">
                        <div className="divide-y">
                            {produtosLancados.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-2 text-sm hover:bg-muted/30 group">
                                    <div className="flex flex-col">
                                        <span className="font-medium uppercase">{p.produtoNome}</span>
                                        <span className="text-[0.65rem] text-muted-foreground">{p.quantidade} x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.precoUnitario)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}</span>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100" 
                                            onClick={() => handleRemoveItem(p.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            <div className="flex justify-between items-center pt-2">
                <div className="flex flex-col">
                    <span className="text-[0.65rem] text-muted-foreground uppercase font-bold">Valor Total Calculado</span>
                    <span className="font-black text-2xl text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCompra)}</span>
                </div>
                <Button 
                    onClick={handleRegisterEntry} 
                    disabled={isSubmitting || produtosLancados.length === 0}
                    className="h-12 px-8"
                >
                    {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                    Registar no Financeiro
                </Button>
            </div>
        </div>
    );
}
