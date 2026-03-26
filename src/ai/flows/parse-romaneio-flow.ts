'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios via IA.
 * 
 * Otimizado para captar produtos, quantidades e valores de fotos de notas fiscais.
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
 * Processa a imagem do romaneio usando o modelo estável gemini-1.5-flash.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const response = await ai.generate({
      // Utilizando o identificador completo 'googleai/gemini-1.5-flash' para garantir 
      // que o provedor resolva corretamente o modelo na API v1beta.
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
    // Exibe o erro original completo no console conforme solicitado para diagnóstico
    console.error("DEBUG - Erro original completo capturado no catch:", error);
    
    // Tratamento de erros de modelo não encontrado ou região
    if (error.message?.includes('404') || error.message?.includes('NOT_FOUND')) {
       throw new Error("Erro de conexão com a IA (Modelo não encontrado ou região não suportada). Verifique se a sua chave de API tem acesso ao modelo gemini-1.5-flash.");
    }
    
    throw new Error(`Erro de Processamento: ${error.message}`);
  }
}
