'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios via IA.
 * 
 * Este ficheiro utiliza a abordagem direta de ai.generate para máxima 
 * compatibilidade com o modelo Gemini 1.5 Flash, evitando erros 404.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseRomaneioInputSchema = z.object({
  romaneioPhoto: z
    .string()
    .describe(
      "A foto de um romaneio ou nota fiscal em Base64 Data URI."
    ),
});
export type ParseRomaneioInput = z.infer<typeof ParseRomaneioInputSchema>;

const ParseRomaneioOutputSchema = z.object({
  items: z.array(z.object({
    produtoNome: z.string().describe("Nome do produto."),
    quantidade: z.number().describe("Qtd."),
    valorTotal: z.number().describe("Valor total da linha."),
  })).describe("Lista de produtos."),
  fornecedorNome: z.string().optional().describe("Nome do fornecedor."),
  dataVencimento: z.string().optional().describe("Vencimento YYYY-MM-DD."),
});
export type ParseRomaneioOutput = z.infer<typeof ParseRomaneioOutputSchema>;

export async function parseRomaneio(input: ParseRomaneioInput): Promise<ParseRomaneioOutput> {
  return parseRomaneioFlow(input);
}

const parseRomaneioFlow = ai.defineFlow(
  {
    name: 'parseRomaneioFlow',
    inputSchema: ParseRomaneioInputSchema,
    outputSchema: ParseRomaneioOutputSchema,
  },
  async (input) => {
    try {
      // Abordagem alternativa: usamos ai.generate diretamente com o modelo explícito
      // Isso resolve falhas de resolução de endpoint que ocorrem em definePrompt
      const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: [
          { text: `Você é um especialista em ler notas fiscais e romaneios brasileiros.
          Extraia o nome do fornecedor, a data de vencimento (se houver) e a lista de itens.
          Para cada item, identifique o nome, a quantidade e o valor total daquela linha.
          Retorne os dados rigorosamente no formato JSON solicitado.` },
          { media: { url: input.romaneioPhoto } }
        ],
        output: {
          schema: ParseRomaneioOutputSchema
        }
      });

      if (!response.output) {
        throw new Error("A IA não conseguiu gerar uma resposta válida.");
      }

      return response.output;
    } catch (error: any) {
      console.error("Erro na extração do romaneio:", error);
      throw new Error(`Erro de Processamento: ${error.message}`);
    }
  }
);
