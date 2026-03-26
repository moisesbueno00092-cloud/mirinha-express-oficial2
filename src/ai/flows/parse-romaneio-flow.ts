'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios via IA.
 * 
 * Otimizado para captar produtos, quantidades e valores de fotos de notas fiscais.
 * Utiliza a API v1 e o modelo gemini-1.5-flash para maior estabilidade.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseRomaneioOutputSchema = z.object({
  items: z.array(z.object({
    produtoNome: z.string().describe("Nome do produto."),
    quantidade: z.number().describe("Quantidade."),
    valorTotal: z.number().describe("Valor total da linha."),
  })).describe("Lista de produtos encontrados na nota."),
  fornecedorNome: z.string().optional().describe("Nome do fornecedor (se visível)."),
  dataVencimento: z.string().optional().describe("Data de vencimento no formato YYYY-MM-DD."),
});

export type ParseRomaneioOutput = z.infer<typeof ParseRomaneioOutputSchema>;

/**
 * Processa a imagem do romaneio usando o modelo gemini-1.5-flash.
 * A apiVersion v1 é configurada no genkit.ts para evitar o erro 404 do v1beta.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: [
        { text: `Você é um especialista em ler romaneios e notas fiscais de mercadorias no Brasil.
        Sua tarefa é extrair:
        1. O nome do fornecedor.
        2. A data de vencimento (formato YYYY-MM-DD).
        3. A lista de produtos contendo: Nome do Produto, Quantidade e Valor Total daquela linha.
        Ignore carimbos, assinaturas ou rasuras que não sejam dados de itens.
        Retorne rigorosamente no formato JSON solicitado.` },
        { media: { url: input.romaneioPhoto } }
      ],
      output: {
        schema: ParseRomaneioOutputSchema
      }
    });

    if (!response.output) {
      throw new Error("A IA não conseguiu identificar os dados na imagem.");
    }

    return response.output;
  } catch (error: any) {
    // LOG CRÍTICO: Captura detalhada dos metadados do erro para diagnóstico no servidor
    console.error("DETALHES DO ERRO GOOGLE AI:");
    console.dir(error, { depth: null });

    const isNotFoundError = error.message?.includes('404') || error.message?.includes('NOT_FOUND');
    const isRegionError = error.message?.includes('location') || error.message?.includes('region');

    if (isNotFoundError || isRegionError) {
      throw new Error(`Erro de IA: O modelo gemini-1.5-flash não está disponível para sua chave atual ou região na API v1. Detalhe: ${error.message}`);
    }
    
    throw new Error(`Erro de Processamento: ${error.message}`);
  }
}
