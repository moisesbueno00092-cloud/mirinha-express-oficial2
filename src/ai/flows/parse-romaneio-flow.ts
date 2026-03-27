'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios com lógica de resiliência.
 * Utiliza identificadores de modelo altamente estáveis para evitar o erro 404 na Vercel.
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

// Lista de modelos estáveis em ordem de preferência.
const MODELS_TO_TRY = [
  'googleai/gemini-1.5-flash',
  'googleai/gemini-1.5-flash-latest',
  'gemini-1.5-flash'
];

export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  for (const modelId of MODELS_TO_TRY) {
    try {
      const response = await ai.generate({
        model: modelId as any,
        prompt: 'Responda apenas "OK".',
      });
      if (response.text?.includes('OK')) {
        return { success: true, message: `Conectado com sucesso via ${modelId}` };
      }
    } catch (e: any) {
      console.warn(`Tentativa com ${modelId} falhou:`, e.message);
    }
  }
  return { success: false, message: 'Nenhum modelo Flash respondeu. Verifique a API Key.' };
}

export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  let lastError = null;

  for (const modelId of MODELS_TO_TRY) {
    try {
      const { output } = await ai.generate({
        model: modelId as any,
        prompt: [
          { text: `Você é um assistente especializado em romaneios de restaurante. 
          Extraia os dados da imagem para JSON:
          1. fornecedorNome: Nome da empresa.
          2. dataVencimento: Data de pagamento (YYYY-MM-DD).
          3. items: lista com produtoNome, quantidade e valorTotal.
          Ignore carimbos ou rasuras.` },
          { media: { url: input.romaneioPhoto, contentType: 'image/jpeg' } }
        ],
        output: { schema: ParseRomaneioOutputSchema },
        config: { temperature: 0.1 }
      });

      if (output) return output;
    } catch (error: any) {
      lastError = error;
      console.error(`Erro ao processar com ${modelId}:`, error.message);
      
      // Se o erro for 404, tentamos o próximo modelo da lista
      if (error.message?.includes('404') || error.message?.toLowerCase().includes('not found')) {
          continue;
      }
      break;
    }
  }

  throw new Error(`IA Indisponível (404): ${lastError?.message || 'Erro de conexão.'}`);
}
