'use client';

import { useState, useMemo, useRef } from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Fornecedor, BomboniereItem } from '@/types';
import { parseRomaneio, testAiConnection } from '@/ai/flows/parse-romaneio-flow';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, FileImage, ClipboardList, CheckCircle2, Zap, Upload } from 'lucide-react';
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

const compressImage = (dataUri: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 1000;
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
        setAiStatus(result.success ? 'online' : 'offline');
        toast({ 
            variant: result.success ? 'default' : 'destructive',
            title: result.success ? 'Conexão OK' : 'Erro de Conexão', 
            description: result.message 
        });
    };

    const processPhoto = async (dataUri: string) => {
        setIsParsingRomaneio(true);
        try {
            const compressed = await compressImage(dataUri);
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
                toast({ title: "Extração Concluída", description: `${output.items.length} itens encontrados.` });
            }

            if (output?.fornecedorNome && fornecedores) {
                const matched = fornecedores.find(f => f.nome.toLowerCase().includes(output.fornecedorNome!.toLowerCase()));
                if (matched) setFornecedorId(matched.id);
            }

            if (output?.dataVencimento) {
                const [y, m, d] = output.dataVencimento.split('-').map(Number);
                setDataVencimento(new Date(y, m - 1, d));
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Falha na IA', description: e.message });
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
                
                const matched = bomboniereItems?.find(bi => p.produtoNome.toLowerCase().startsWith(bi.name.toLowerCase().split('(')[0].trim()));
                if (matched) {
                    batch.update(doc(firestore, 'bomboniere_items', matched.id), { estoque: matched.estoque + p.quantidade });
                }
            }

            await batch.commit();
            toast({ title: 'Registo Concluído!' });
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
        <div className="space-y-4">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png" onChange={handleFileChange} />

            <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                    <div className={cn("w-2 h-2 rounded-full", aiStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : aiStatus === 'offline' ? 'bg-red-500' : 'bg-gray-500')} />
                    <span className="text-[0.6rem] font-black uppercase tracking-widest text-muted-foreground">IA STATUS</span>
                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={handleCheckStatus} disabled={isTestingConnection}>
                        {isTestingConnection ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 text-primary" />}
                    </Button>
                </div>

                <div 
                    className="flex-grow max-w-[280px] bg-primary/5 border border-dashed border-primary/30 rounded-md py-1.5 px-4 text-center cursor-pointer hover:bg-primary/10 transition-all group" 
                    onClick={() => fileInputRef.current?.click()}
                >
                    {isParsingRomaneio ? (
                        <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span className="text-[0.65rem] font-black uppercase text-primary">Analisando...</span>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-2">
                            <Upload className="h-3.5 w-3.5 text-primary" />
                            <span className="font-bold text-[0.7rem] uppercase">Carregar Romaneio JPG</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label className="text-muted-foreground uppercase text-[0.6rem] font-bold tracking-widest">Fornecedor</Label>
                    <Select value={fornecedorId} onValueChange={setFornecedorId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>{fornecedores?.map(f => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-muted-foreground uppercase text-[0.6rem] font-bold tracking-widest">Vencimento</Label>
                    <div className="h-8"><DatePicker date={dataVencimento} setDate={setDataVencimento} /></div>
                </div>
            </div>

            {produtosLancados.length > 0 && (
                <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 shadow-md">
                    <div className="bg-muted/30 px-4 py-2 flex justify-between items-center border-b border-border/50">
                        <span className="flex items-center gap-2 text-primary font-black uppercase text-[0.6rem] tracking-widest"><ClipboardList className="h-3.5 w-3.5"/> Itens Extraídos</span>
                        <span className="text-foreground font-black text-xs">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(produtosLancados.reduce((acc, p) => acc + p.preco, 0))}</span>
                    </div>
                    <ScrollArea className="h-40">
                        <div className="divide-y divide-border/30">
                            {produtosLancados.map(p => (
                                <div key={p.id} className="flex justify-between items-center px-4 py-2 hover:bg-primary/5">
                                    <div className="flex flex-col">
                                        <span className="font-bold uppercase text-[0.6rem] leading-none">{p.produtoNome}</span>
                                        <span className="text-[0.5rem] text-muted-foreground font-medium uppercase">{p.quantity} un · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.precoUnitario)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-black text-primary text-xs">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/30 hover:text-destructive" onClick={() => setProdutosLancados(prev => prev.filter(item => item.id !== p.id))}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="p-2 bg-muted/10 border-t border-border/50 flex justify-end">
                        <Button onClick={handleRegisterEntry} disabled={isSubmitting} className="h-7 px-4 text-[0.65rem] font-black gap-2">
                            {isSubmitting ? <Loader2 className="animate-spin h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                            Confirmar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
