'use client';

import { useState, useMemo, useRef } from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Fornecedor, BomboniereItem } from '@/types';
import { parseRomaneio, testAiConnection } from '@/ai/flows/parse-romaneio-flow';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Upload, FileImage, ClipboardList, CheckCircle2, Zap } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { format as formatDateFn } from 'date-fns';
import { DatePicker } from '../ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '@/lib/utils';

interface LancamentoProduto {
    id: string;
    produtoNome: string;
    preco: number;
    quantidade: number;
    precoUnitario: number;
}

/**
 * Comprime a imagem no cliente para evitar erros de limite de memória no servidor.
 * Otimizado para manter a legibilidade do texto para a IA.
 */
const compressImage = (dataUri: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1000; // Tamanho ideal para OCR
            let width = img.width;
            let height = img.height;
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
            }
            resolve(canvas.toDataURL('image/jpeg', 0.7)); // Qualidade balanceada
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
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [aiStatus, setAiStatus] = useState<'idle' | 'online' | 'offline'>('idle');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fornecedoresQuery = useMemo(() => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null, [firestore]);
    const { data: fornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);
    const { data: bomboniereItems } = useCollection<BomboniereItem>(bomboniereItemsQuery);

    const handleCheckStatus = async () => {
        setIsTestingConnection(true);
        const result = await testAiConnection();
        setIsTestingConnection(false);
        
        if (result.success) {
            setAiStatus('online');
            toast({ title: 'IA Ativa', description: result.message });
        } else {
            setAiStatus('offline');
            toast({ variant: 'destructive', title: 'Falha na IA', description: result.message });
        }
    };

    const processPhoto = async (dataUri: string) => {
        setIsParsingRomaneio(true);
        try {
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
                setProdutosLancados(newItems);
                toast({ title: "Sucesso!", description: `Lidos ${output.items.length} itens do romaneio.` });
            }

            if (output?.fornecedorNome && fornecedores) {
                const matched = fornecedores.find(f => 
                    f.nome.toLowerCase().includes(output.fornecedorNome!.toLowerCase())
                );
                if (matched) setFornecedorId(matched.id);
            }

            if (output?.dataVencimento) {
                try {
                    const [y, m, d] = output.dataVencimento.split('-').map(Number);
                    setDataVencimento(new Date(y, m - 1, d));
                } catch {}
            }
        } catch (e: any) {
            console.error("Erro no processamento:", e);
            toast({ variant: 'destructive', title: 'Erro de Análise', description: e.message });
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
        e.target.value = ''; 
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

            batch.set(doc(collection(firestore, 'contas_a_pagar')), {
                descricao: `Romaneio de Mercadorias`,
                fornecedorId: finalFornecedorId,
                valor: produtosLancados.reduce((acc, p) => acc + p.preco, 0),
                dataVencimento: formatDateFn(vencimento, 'yyyy-MM-dd'),
                estaPaga,
                romaneioId
            });

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
                
                const matched = bomboniereItems?.find(bi => 
                    p.produtoNome.toLowerCase().startsWith(bi.name.toLowerCase().split('(')[0].trim())
                );
                if (matched) {
                    batch.update(doc(firestore, 'bomboniere_items', matched.id), { 
                        estoque: matched.estoque + p.quantidade 
                    });
                }
            }

            await batch.commit();
            toast({ title: 'Lançamento Concluído!' });
            setProdutosLancados([]);
            setFornecedorId(undefined);
            setDataVencimento(undefined);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Erro ao Gravar' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png" onChange={handleFileChange} />

            <div className="flex justify-between items-center bg-muted/20 p-3 rounded-xl border border-border/50">
                <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", 
                        aiStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : aiStatus === 'offline' ? 'bg-red-500' : 'bg-gray-500'
                    )} />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        IA: {aiStatus === 'online' ? 'LIGADA' : aiStatus === 'offline' ? 'DESLIGADA' : 'PRONTA'}
                    </span>
                </div>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 gap-2 text-[0.65rem] font-bold hover:bg-primary/10" 
                    onClick={handleCheckStatus}
                    disabled={isTestingConnection}
                >
                    {isTestingConnection ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Zap className="h-3 w-3 text-primary" />}
                    TESTAR CONEXÃO VERCEL
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-muted-foreground uppercase text-[0.65rem] font-bold">Fornecedor (Opcional)</Label>
                    <Select value={fornecedorId} onValueChange={setFornecedorId}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                        <SelectContent>
                            {fornecedores?.map(f => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-muted-foreground uppercase text-[0.65rem] font-bold">Data de Vencimento</Label>
                    <DatePicker date={dataVencimento} setDate={setDataVencimento} />
                </div>
            </div>

            <div className="bg-primary/5 border-2 border-dashed border-primary/20 rounded-3xl p-12 text-center space-y-6 transition-all hover:bg-primary/10 hover:border-primary/40 group">
                <div className="bg-primary/10 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                    <FileImage className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                    <h3 className="font-black text-2xl text-foreground">Carregar Romaneio</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto text-sm">Selecione a foto do romaneio do seu dispositivo para análise automática pela IA.</p>
                </div>
                <Button 
                    size="lg" 
                    className="w-full sm:w-auto h-16 gap-4 text-xl font-black px-16 rounded-2xl shadow-2xl hover:translate-y-[-2px] transition-all" 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isParsingRomaneio}
                >
                    {isParsingRomaneio ? <Loader2 className="h-7 w-7 animate-spin"/> : <Upload className="h-7 w-7"/>}
                    {isParsingRomaneio ? 'Analisando Imagem...' : 'Escolher Ficheiro'}
                </Button>
            </div>

            {produtosLancados.length > 0 && (
                <div className="border border-border/50 rounded-3xl overflow-hidden bg-card/50 shadow-2xl backdrop-blur-sm">
                    <div className="bg-muted/30 px-8 py-5 flex justify-between items-center border-b border-border/50">
                        <span className="flex items-center gap-3 text-primary font-bold uppercase text-sm tracking-widest"><ClipboardList className="h-5 w-5"/> Itens Extraídos</span>
                        <span className="text-foreground font-black text-lg">Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(produtosLancados.reduce((acc, p) => acc + p.preco, 0))}</span>
                    </div>
                    <ScrollArea className="h-80">
                        <div className="divide-y divide-border/30">
                            {produtosLancados.map(p => (
                                <div key={p.id} className="flex justify-between items-center px-8 py-6 hover:bg-primary/5 transition-colors">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-bold uppercase text-base leading-none">{p.produtoNome}</span>
                                        <span className="text-[0.7rem] text-muted-foreground font-medium uppercase tracking-tight">
                                            {p.quantidade.toLocaleString('pt-BR')} un · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.precoUnitario)} un
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <span className="font-mono font-black text-primary text-xl">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}</span>
                                        <Button variant="ghost" size="icon" className="h-12 w-12 text-destructive/30 hover:text-destructive" onClick={() => setProdutosLancados(prev => prev.filter(item => item.id !== p.id))}><Trash2 className="h-6 w-6" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="p-8 bg-muted/10 border-t border-border/50 flex justify-end">
                        <Button onClick={handleRegisterEntry} disabled={isSubmitting} className="h-16 px-16 text-xl font-black gap-4 rounded-2xl">
                            {isSubmitting ? <Loader2 className="animate-spin h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
                            Salvar Lançamento
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
