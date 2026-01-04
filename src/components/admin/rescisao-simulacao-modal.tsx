
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Separator } from '@/components/ui/separator';
import type { Funcionario, VerbasRescisorias } from '@/types';
import { differenceInMonths, getDaysInMonth, parseISO } from 'date-fns';

interface RescisaoSimulacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  funcionario: Funcionario;
  tempoDeCasaEmMeses: number;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
};

const initialVerbas: VerbasRescisorias = {
    saldoSalario: 0,
    avisoPrevio: 0,
    feriasVencidas: 0,
    feriasProporcionais: 0,
    tercoFerias: 0,
    decimoTerceiroProporcional: 0,
    total: 0,
};

export default function RescisaoSimulacaoModal({ isOpen, onClose, funcionario, tempoDeCasaEmMeses }: RescisaoSimulacaoModalProps) {
  const [dataRescisao, setDataRescisao] = useState<Date | undefined>(new Date());
  const [verbas, setVerbas] = useState<VerbasRescisorias>(initialVerbas);
  
  useEffect(() => {
    if (isOpen) {
      setDataRescisao(new Date());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!dataRescisao || !funcionario.salarioBase) {
      setVerbas(initialVerbas);
      return;
    }

    const salarioBase = funcionario.salarioBase;
    const dataAdmissao = parseISO(funcionario.dataAdmissao);
    const diaRescisao = dataRescisao.getDate();
    const diasNoMes = getDaysInMonth(dataRescisao);
    
    let saldoSalario = (salarioBase / diasNoMes) * diaRescisao;
    let avisoPrevio = salarioBase; // Hardcoded for demissao_sem_justa_causa
    let feriasVencidas = 0;
    
    const mesesTrabalhadosNoAno = dataRescisao.getMonth() + 1;
    const decimoTerceiroProporcional = (salarioBase / 12) * mesesTrabalhadosNoAno;

    const mesesCompletos = differenceInMonths(dataRescisao, dataAdmissao);
    const periodosAquisitivosCompletos = Math.floor(mesesCompletos / 12);
    const mesesPeriodoAtual = mesesCompletos % 12;

    const feriasProporcionais = (salarioBase / 12) * mesesPeriodoAtual;

    if (periodosAquisitivosCompletos >= 1) {
      // Assume que as férias do período anterior não foram gozadas
      feriasVencidas = salarioBase * (periodosAquisitivosCompletos - (mesesCompletos >= 23 ? 0 : 1));
    }
    
    const totalFerias = feriasVencidas + feriasProporcionais;
    const tercoFerias = totalFerias / 3;

    const total = saldoSalario + avisoPrevio + decimoTerceiroProporcional + totalFerias + tercoFerias;

    setVerbas({
      saldoSalario,
      avisoPrevio,
      feriasVencidas,
      feriasProporcionais,
      tercoFerias,
      decimoTerceiroProporcional,
      total,
    });

  }, [dataRescisao, funcionario, tempoDeCasaEmMeses]);


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Simulação de Rescisão</DialogTitle>
          <DialogDescription>
            Calcule uma estimativa das verbas rescisórias para {funcionario.nome}. Os valores são aproximados para um cenário de demissão sem justa causa.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
            <div className="space-y-2">
                <Label htmlFor="data-rescisao">Data da Rescisão</Label>
                <DatePicker date={dataRescisao} setDate={setDataRescisao} />
            </div>
            
            <Separator />

            <div className="space-y-2 rounded-lg bg-muted/50 p-4">
                <h4 className="font-semibold text-center mb-3">Verbas Rescisórias Estimadas</h4>
                <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Saldo de Salário:</span> <span className="font-mono">{formatCurrency(verbas.saldoSalario)}</span></div>
                    <div className="flex justify-between"><span>Aviso Prévio Indenizado:</span> <span className="font-mono">{formatCurrency(verbas.avisoPrevio)}</span></div>
                    <div className="flex justify-between"><span>13º Salário Proporcional:</span> <span className="font-mono">{formatCurrency(verbas.decimoTerceiroProporcional)}</span></div>
                    {verbas.feriasVencidas > 0 && <div className="flex justify-between"><span>Férias Vencidas:</span> <span className="font-mono">{formatCurrency(verbas.feriasVencidas)}</span></div>}
                    <div className="flex justify-between"><span>Férias Proporcionais:</span> <span className="font-mono">{formatCurrency(verbas.feriasProporcionais)}</span></div>
                    <div className="flex justify-between"><span>1/3 sobre Férias:</span> <span className="font-mono">{formatCurrency(verbas.tercoFerias)}</span></div>
                </div>
                <Separator className="my-2"/>
                 <div className="flex justify-between items-center text-lg font-bold text-primary pt-1">
                    <span>Total Estimado:</span>
                    <span className="font-mono">{formatCurrency(verbas.total)}</span>
                 </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
                * Os valores são uma estimativa e não incluem descontos (INSS, IRRF) ou a multa do FGTS. Consulte um contabilista para valores exatos.
            </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
