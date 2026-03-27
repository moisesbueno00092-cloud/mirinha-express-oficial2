'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Fornecedor, BomboniereItem } from '@/types';
import { parseRomaneio, testAiConnection } from '@/ai/flows/parse-romaneio-flow';

import { Button } from '@/components/ui/button';
import { Loader2, Trash2, ClipboardList, CheckCircle2, Zap, X, ImageIcon, FileText } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { format as formatDateFn } from 'date-fns';
import { DatePicker } from '../ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Image from 'next/image';

interface LancamentoProduto {
    id: string;
    produtoNome: string;
    preco: number;
    quantidade: number;
    precoUnitario: number;
}

const compressImage = (dataUri: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onerror = () => reject(new Error('Falha ao carregar imagem para compressão'));
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 1024; 
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.drawImage(img, 0, 0, width, height); }
            resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = dataUri;
    });
};

export default function MercadoriasPanel() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [previewUri, setPreviewUri] = useState<string | null>(null);
    const [fornecedorId, setFornecedorId] = useState<string | undefined>(undefined);
    const [dataVencimento, setDataVencimento] = useState<Date | undefined>(undefined);
    const [produtosLancados, setProdutosLancados] = useState<LancamentoProduto[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fornecedoresQuery = useMemo(() => firestore ? query(collection(firestore, 'fornecedores'), orderBy('nome', 'asc')) : null, [firestore]);
    const { data: fornecedores } = useCollection<Fornecedor>(fornecedoresQuery);
    const bomboniereItemsQuery = useMemo(() => firestore ? query(collection(firestore, 'bomboniere_items')) : null, [firestore]);
    const { data: bomboniereItems } = useCollection<BomboniereItem>(bomboniereItemsQuery);

    const reset = () => {
        setPreviewUri(null);
        setProdutosLancados([]);
        setFornecedorId(undefined);
        setDataVencimento(undefined);
        setIsParsing(false);
    };

    const runAnalysis = useCallback(async (uri: string) => {
        setIsParsing(true);
        try {
            const compressed = await compressImage(uri);
            const output = await parseRomaneio({ romaneioPhoto: compressed });
            
            if (output?.items?.length > 0) {
                const newItems = output.items.map((it: any) => ({ 
                    id: Math.random().toString(36).substr(2, 9), 
                    produtoNome: it.produtoNome, 
                    preco: it.valorTotal, 
                    quantidade: it.quantidade, 
                    precoUnitario: it.quantidade > 0 ? it.valorTotal / it.quantidade : it.valorTotal
                }));
                setProdutosLancados(newItems);
            }

            if (output?.fornecedorNome && fornecedores) {
                const matched = fornecedores.find(f => f.nome.toLowerCase().includes(output.fornecedorNome!.toLowerCase()));
                if (matched) setFornecedorId(matched.id);
            }

            if (output?.dataVencimento) {
                const [y, m, d] = output.dataVencimento.split('-').map(Number);
                setDataVencimento(new Date(y, m - 1, d));
            }
            toast({ title: "Extração concluída!" });
        } catch (e: any) {
            console.error("Analysis Error:", e);
            toast({ variant: 'destructive', title: 'Falha na IA', description: e.message || 'Verifique se a chave da API está ativa.' });
        } finally {
            setIsParsing(false);
        }
    }, [fornecedores, toast]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const uri = event.target?.result as string;
            setPreviewUri(uri);
            runAnalysis(uri);
        };
        reader.readAsDataURL(file);
        e.target.value = ''; 
    };

    const handleConfirmAll = async () => {
        if (!firestore || produtosLancados.length === 0) return;
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
                
                const matched = bomboniereItems?.find(bi => p.produtoNome.toLowerCase().startsWith(bi.name.toLowerCase().split('(')[0].trim()));
                if (matched) {
                    batch.update(doc(firestore, 'bomboniere_items', matched.id), { estoque: matched.estoque + p.quantidade });
                }
            }

            await batch.commit();
            toast({ title: 'Sucesso!', description: 'Entrada gravada com sucesso.' });
            setIsModalOpen(false);
            reset();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Erro ao gravar dados' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-primary/90">
                    <FileText className="h-4 w-4" />
                    Romaneio IA
                </Button>
                <Button variant="ghost" size="icon" onClick={async () => {
                    setIsTesting(true);
                    const res = await testAiConnection();
                    setIsTesting(false);
                    toast({ title: res.success ? "Conexão OK" : "Falha na IA", description: res.message });
                }}>
                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-primary" />}
                </Button>
            </div>

            <Dialog open={isModalOpen} onOpenChange={(open) => { if(!open) reset(); setIsModalOpen(open); }}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl border-primary/20">
                    <DialogHeader className="p-6 border-b bg-muted/10">
                        <DialogTitle className="flex items-center gap-2"><ClipboardList className="text-primary"/> Assistente de Importação IA</DialogTitle>
                        <DialogDescription>A extração começará automaticamente após selecionar a foto.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-grow overflow-hidden flex flex-col md:flex-row">
                        {/* Lado Esquerdo: Imagem */}
                        <div className="w-full md:w-1/2 bg-muted/30 p-4 flex flex-col items-center justify-center border-r border-border/50">
                            {previewUri ? (
                                <div className="relative w-full h-full min-h-[300px] rounded-lg overflow-hidden border shadow-inner bg-black/5">
                                    <Image src={previewUri} alt="Preview" fill className="object-contain" />
                                    {isParsing && (
                                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 backdrop-blur-[3px] z-20">
                                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                            <span className="text-white font-black text-sm uppercase tracking-widest">IA Analisando...</span>
                                        </div>
                                    )}
                                    {!isParsing && (
                                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg" onClick={() => setPreviewUri(null)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div 
                                    className="w-full h-full min-h-[300px] border-2 border-dashed border-primary/20 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-primary/5 transition-all group"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="bg-primary/10 p-4 rounded-full group-hover:scale-110 transition-transform">
                                        <ImageIcon className="h-10 w-10 text-primary/60" />
                                    </div>
                                    <p className="mt-4 text-sm font-bold text-muted-foreground uppercase tracking-tighter">Clique para selecionar foto do Romaneio</p>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                                </div>
                            )}
                        </div>

                        {/* Lado Direito: Dados Extraídos */}
                        <div className="w-full md:w-1/2 p-6 flex flex-col gap-6 bg-background">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <span className="text-[0.65rem] font-black uppercase text-primary tracking-widest">Fornecedor</span>
                                    <Select value={fornecedorId} onValueChange={setFornecedorId}>
                                        <SelectTrigger className="h-10 font-bold"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>{fornecedores?.map(f => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <span className="text-[0.65rem] font-black uppercase text-primary tracking-widest">Vencimento</span>
                                    <DatePicker date={dataVencimento} setDate={setDataVencimento} />
                                </div>
                            </div>

                            <div className="flex-grow flex flex-col min-h-0 border rounded-lg bg-card/50 overflow-hidden">
                                <div className="px-4 py-3 border-b bg-primary/5 flex justify-between items-center">
                                    <span className="text-[0.65rem] font-black uppercase text-primary tracking-widest">Itens Detetados</span>
                                    <span className="text-lg font-black tabular-nums text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(produtosLancados.reduce((acc, p) => acc + p.preco, 0))}</span>
                                </div>
                                <ScrollArea className="flex-grow">
                                    {produtosLancados.length > 0 ? (
                                        <div className="divide-y divide-border/50">
                                            {produtosLancados.map(p => (
                                                <div key={p.id} className="p-3 flex justify-between items-center hover:bg-accent/30 transition-colors">
                                                    <div className="flex flex-col">
                                                        <span className="text-[0.7rem] font-black uppercase leading-tight truncate max-w-[180px]">{p.produtoNome}</span>
                                                        <span className="text-[0.6rem] text-muted-foreground font-bold">{p.quantidade} un · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.precoUnitario)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm font-mono font-black text-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}</span>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/40 hover:text-destructive hover:bg-destructive/10" onClick={() => setProdutosLancados(prev => prev.filter(it => it.id !== p.id))}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-40 flex flex-col items-center justify-center text-muted-foreground/40 text-[0.6rem] uppercase font-black p-4 text-center gap-2">
                                            {isParsing ? (
                                                <>
                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                    IA está a ler os dados...
                                                </>
                                            ) : "Aguardando imagem para processar..."}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-6 border-t bg-muted/5 gap-3">
                        <Button variant="outline" onClick={() => setIsModalOpen(false)} className="h-12 font-bold uppercase tracking-widest text-xs">Cancelar</Button>
                        <Button onClick={handleConfirmAll} disabled={isSubmitting || !produtosLancados.length || isParsing} className="h-12 px-10 font-black text-lg gap-2 shadow-xl shadow-primary/20">
                            {isSubmitting ? <Loader2 className="animate-spin h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                            Confirmar Entrada
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
