'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios com máxima resiliência regional.
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
  const modelsToTry = ['googleai/gemini-1.5-flash', 'gemini-1.5-flash'];
  
  for (const model of modelsToTry) {
    try {
      const response = await ai.generate({
        model: model as any,
        prompt: 'Responda apenas "CONECTADO".',
      });
      if (response.text?.includes('CONECTADO')) {
        return { success: true, message: `IA conectada via ${model}.` };
      }
    } catch (e) {
      console.warn(`Falha no teste com modelo ${model}:`, e);
    }
  }
  return { success: false, message: 'Nenhum modelo de IA disponível na sua região.' };
}

/**
 * Analisa a foto de um romaneio utilizando estratégia de fallback entre modelos Flash.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  const modelsToTry = ['googleai/gemini-1.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const { output } = await ai.generate({
        model: model as any,
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
    } catch (error: any) {
      console.warn(`Tentativa com ${model} falhou:`, error.message);
      lastError = error;
    }
  }

  throw new Error(`IA Indisponível: Não foi possível conectar a nenhum modelo na sua região. Tente novamente ou use o teste de conexão. Detalhe: ${lastError?.message || 'Erro desconhecido'}`);
}
