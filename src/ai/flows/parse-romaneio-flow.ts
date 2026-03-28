'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios com máxima resiliência regional.
 * Utiliza o identificador qualificado estável googleai/gemini-1.5-flash.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseRomaneioOutputSchema = z.object({
  items: z.array(z.object({
    produtoNome: z.string(),
    quantidade: z.number(),
    valorTotal: z.number(),
  })),
  fornecedorNome: z.string().optional(),
  dataVencimento: z.string().optional(),
});

export type ParseRomaneioOutput = z.infer<typeof ParseRomaneioOutputSchema>;

/**
 * Testa a conexão com a IA utilizando identificadores estáveis.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: 'Responda apenas "CONECTADO".',
    });
    if (response.text?.includes('CONECTADO')) {
      return { success: true, message: 'IA conectada com sucesso via Gemini 1.5 Flash.' };
    }
    return { success: false, message: 'Resposta inesperada da IA.' };
  } catch (e: any) {
    console.warn('Falha no teste de conexão IA:', e.message);
    return { success: false, message: `IA Indisponível: ${e.message}` };
  }
}

/**
 * Analisa a foto de um romaneio utilizando o modelo estável Gemini 1.5 Flash.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  let lastError: any = null;

  try {
    const { output } = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: [
        { text: `Você é um assistente especializado em romaneios de restaurante. 
        Extraia os dados da imagem para JSON:
        1. fornecedorNome: Nome da empresa.
        2. dataVencimento: Data de pagamento (formato YYYY-MM-DD). Se não encontrar, deixe vazio.
        3. items: lista com produtoNome, quantidade e valorTotal.
        Ignore carimbos, assinaturas ou rasuras.` },
        { media: { url: input.romaneioPhoto, contentType: 'image/jpeg' } }
      ],
      output: { schema: ParseRomaneioOutputSchema },
      config: { temperature: 0.1 }
    });

    if (output) return output;
    throw new Error('A IA não retornou dados válidos.');
  } catch (error: any) {
    console.warn('Erro na extração do romaneio:', error.message);
    lastError = error;
  }

  throw new Error(`IA Indisponível: O modelo Gemini 1.5 Flash não está a responder corretamente na sua região. Tente novamente. Detalhe: ${lastError?.message || 'Erro desconhecido'}`);
}