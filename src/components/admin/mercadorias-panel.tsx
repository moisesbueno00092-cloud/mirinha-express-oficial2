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
import { Loader2, Trash2, Save, Upload, FileImage, ClipboardList, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { format as formatDateFn } from 'date-fns';
import { DatePicker } from '../ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface LancamentoProduto {
    id: string;
    produtoNome: string;
    preco: number;
    quantidade: number;
    precoUnitario: number;
}

/**
 * Comprime a imagem no navegador para garantir que seja menor que 1MB.
 * Isso resolve o erro "Body exceeded 1 MB" e acelera a IA.
 */
const compressImage = (dataUri: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200; // Resolução ideal para OCR
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
            // Qualidade 0.7 para manter nitidez dos textos
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isParsingRomaneio, setIsParsingRomaneio] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fornecedoresQuery = useMemo(() => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null, [firestore]);
    const { data: fornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);
    const { data: bomboniereItems } = useCollection<BomboniereItem>(bomboniereItemsQuery);

    const processPhoto = async (dataUri: string) => {
        setIsParsingRomaneio(true);
        try {
            // Compressão local antes de enviar para o servidor
            const compressed = await compressImage(dataUri);
            const output = await parseRomaneio({ romaneioPhoto: compressed });
            
            if (output && output.items && output.items.length > 0) {
                const newItems = output.items.map((it: any) => ({ 
                    id: Math.random().toString(36).substr(2, 9), 
                    produtoNome: it.produtoNome, 
                    preco: it.valorTotal, 
                    quantidade: it.quantidade, 
                    precoUnitario: it.quantidade > 0 ? it.valorTotal / it.quantidade : it.valorTotal
                }));
                setProdutosLancados(prev => [...prev, ...newItems]);
                toast({ title: "Extração Concluída", description: `${output.items.length} itens encontrados no romaneio.` });
            }

            if (output?.fornecedorNome && fornecedores) {
                const matched = fornecedores.find(f => f.nome.toLowerCase().includes(output.fornecedorNome!.toLowerCase()));
                if (matched) setFornecedorId(matched.id);
            }
            if (output?.dataVencimento) {
                try {
                    const [y, m, d] = output.dataVencimento.split('-').map(Number);
                    setDataVencimento(new Date(y, m - 1, d));
                } catch {}
            }
        } catch (e: any) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Erro de Extração', description: e.message });
        } finally {
            setIsParsingRomaneio(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => processPhoto(event.target?.result as string);
        reader.readAsDataURL(file);
        e.target.value = ''; // Limpar input para permitir nova seleção do mesmo ficheiro
    };

    const handleRegisterEntry = async () => {
        if (!firestore || produtosLancados.length === 0 || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const batch = writeBatch(firestore);
            const romaneioId = doc(collection(firestore, '_')).id;
            const finalFornecedorId = fornecedorId || 'extra_expenses_provider';
            const estaPaga = !dataVencimento;
            const vencimento = dataVencimento || new Date();

            // 1. Criar a Conta a Pagar
            batch.set(doc(collection(firestore, 'contas_a_pagar')), {
                descricao: `Compra via Romaneio IA`,
                fornecedorId: finalFornecedorId,
                valor: produtosLancados.reduce((acc, p) => acc + p.preco, 0),
                dataVencimento: formatDateFn(vencimento, 'yyyy-MM-dd'),
                estaPaga,
                romaneioId
            });

            // 2. Criar o histórico de entradas e atualizar estoque
            for (const p of produtosLancados) {
                batch.set(doc(collection(firestore, 'entradas_mercadorias')), {
                    produtoNome: p.produtoNome,
                    fornecedorId: finalFornecedorId,
                    data: new Date().toISOString(),
                    quantidade: p.quantidade,
                    precoUnitario: p.precoUnitario,
                    valorTotal: p.preco,
                    estaPaga,
                    romaneioId
                });
                
                // Atualizar estoque se for item de bomboniere
                const matched = bomboniereItems?.find(bi => p.produtoNome.toLowerCase().startsWith(bi.name.toLowerCase().split('(')[0].trim()));
                if (matched) {
                    batch.update(doc(firestore, 'bomboniere_items', matched.id), { estoque: matched.estoque + p.quantidade });
                }
            }

            await batch.commit();
            toast({ title: 'Sucesso!', description: 'Lançamento financeiro e histórico criados.' });
            setProdutosLancados([]);
            setFornecedorId(undefined);
            setDataVencimento(undefined);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Erro ao Salvar' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalCompra = produtosLancados.reduce((acc, p) => acc + p.preco, 0);

    return (
        <div className="space-y-6">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/jpeg,image/png" 
                onChange={handleFileChange} 
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-muted-foreground uppercase text-[0.65rem] font-bold">Fornecedor</Label>
                    <Select value={fornecedorId} onValueChange={setFornecedorId}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                        <SelectContent>
                            {fornecedores?.map(f => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-muted-foreground uppercase text-[0.65rem] font-bold">Vencimento (Vazio = Pago Hoje)</Label>
                    <DatePicker date={dataVencimento} setDate={setDataVencimento} />
                </div>
            </div>

            <div className="bg-primary/5 border-2 border-dashed border-primary/30 rounded-2xl p-10 text-center space-y-5">
                <div className="bg-primary/10 p-5 rounded-full w-20 h-20 flex items-center justify-center mx-auto">
                    <FileImage className="h-10 w-10 text-primary" />
                </div>
                <div>
                    <h3 className="font-black text-xl text-foreground">Entrada por Imagem JPG</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">Carregue uma foto do romaneio do seu computador para que a IA extraia os dados automaticamente.</p>
                </div>
                <Button 
                    size="lg" 
                    className="w-full sm:w-auto h-16 gap-3 text-lg font-black px-12 rounded-xl shadow-lg" 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isParsingRomaneio}
                >
                    {isParsingRomaneio ? <Loader2 className="h-6 w-6 animate-spin"/> : <Upload className="h-6 w-6"/>}
                    {isParsingRomaneio ? 'Analisando Romaneio...' : 'Escolher Imagem (JPG/PNG)'}
                </Button>
            </div>

            {produtosLancados.length > 0 && (
                <div className="border rounded-2xl overflow-hidden bg-card shadow-xl">
                    <div className="bg-muted/50 px-6 py-4 text-[0.7rem] font-black uppercase flex justify-between items-center border-b">
                        <span className="flex items-center gap-2 text-primary"><ClipboardList className="h-4 w-4"/> Itens Identificados pela IA</span>
                        <span className="text-foreground text-base">Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCompra)}</span>
                    </div>
                    <ScrollArea className="h-72">
                        <div className="divide-y">
                            {produtosLancados.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-5 hover:bg-muted/30 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="font-bold uppercase text-sm leading-tight">{p.produtoNome}</span>
                                        <span className="text-[0.65rem] text-muted-foreground mt-1">
                                            {p.quantidade.toLocaleString('pt-BR')} un x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.precoUnitario)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <span className="font-mono font-black text-primary text-base">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}</span>
                                        <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded-full" onClick={() => setProdutosLancados(prev => prev.filter(item => item.id !== p.id))}><Trash2 className="h-5 w-5" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="p-6 bg-muted/20 border-t flex justify-end">
                        <Button onClick={handleRegisterEntry} disabled={isSubmitting} className="h-14 px-12 text-lg font-black gap-3 rounded-xl">
                            {isSubmitting ? <Loader2 className="animate-spin h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                            Confirmar e Criar Lançamento
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
