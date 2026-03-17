'use server';

/**
 * @fileOverview Gerador de Relatórios Estratégicos de Gestão.
 * 
 * Analisa dados de vendas, compras e tendências para fornecer insights ao gestor.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ManagementReportInputSchema = z.object({
  periodLabel: z.string().describe('O nome do período (ex: Janeiro 2024).'),
  salesData: z.any().describe('Dados consolidados de vendas do período.'),
  expenseData: z.any().describe('Dados consolidados de compras de mercadorias do período.'),
  customerStats: z.any().describe('Resumo do comportamento dos clientes.'),
});
export type ManagementReportInput = z.infer<typeof ManagementReportInputSchema>;

const ManagementReportOutputSchema = z.object({
  summary: z.string().describe('Um resumo executivo da saúde financeira do período.'),
  topSellingItems: z.array(z.object({
    name: z.string(),
    count: z.number(),
    category: z.enum(['Refeição', 'Bomboniere']),
  })).describe('Ranking dos produtos mais vendidos.'),
  mainExpenses: z.array(z.object({
    name: z.string(),
    totalValue: z.number(),
  })).describe('Principais custos com mercadorias.'),
  strategicAdvice: z.string().describe('Conselhos práticos para o gestor melhorar o negócio.'),
  efficiencyScore: z.number().min(0).max(100).describe('Uma nota de 0 a 100 para a eficiência do período.'),
});
export type ManagementReportOutput = z.infer<typeof ManagementReportOutputSchema>;

export async function generateManagementReport(input: ManagementReportInput): Promise<ManagementReportOutput> {
  return generateManagementReportFlow(input);
}

const managementPrompt = ai.definePrompt({
  name: 'managementPrompt',
  input: { schema: ManagementReportInputSchema },
  output: { schema: ManagementReportOutputSchema },
  prompt: `Você é um consultor especializado em gestão de restaurantes brasileiros. 
Analise os dados reais do "Restaurante da Mirinha" referentes ao período de {{{periodLabel}}}.

DADOS DE VENDAS:
{{{json salesData}}}

DADOS DE COMPRAS (MERCADORIAS):
{{{json expenseData}}}

RESUMO DE CLIENTES:
{{{json customerStats}}}

Sua tarefa é gerar um relatório de gestão de alto nível que ajude a Mirinha a tomar decisões.
Instruções:
1. Identifique o "Carro Chefe" (o que mais vende) e a "Estrela da Bomboniere".
2. Analise se o volume de vendas na RUA compensa as taxas de entrega.
3. Verifique o peso dos FIADOS no faturamento total e dê um alerta se estiverem muito altos.
4. Olhe para as COMPRAS: quais mercadorias estão custando mais? Há variação de preço preocupante?
5. Seja prático e direto nos conselhos. Use uma linguagem profissional porém acolhedora.

Formate a saída rigorosamente conforme o esquema solicitado.`,
});

const generateManagementReportFlow = ai.defineFlow(
  {
    name: 'generateManagementReportFlow',
    inputSchema: ManagementReportInputSchema,
    outputSchema: ManagementReportOutputSchema,
  },
  async (input) => {
    const { output } = await managementPrompt(input);
    return output!;
  }
);
