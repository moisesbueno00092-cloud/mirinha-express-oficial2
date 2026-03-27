'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando Gemini 1.5 Flash.
 * Implementa estratégia de fallback e identificadores estáveis para evitar erros 404.
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
 * Função simples para testar a ligação com a IA.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: 'Responda apenas "OK".',
    });
    if (response.text?.includes('OK')) {
      return { success: true, message: `Conectado via Gemini 1.5 Flash` };
    }
    return { success: false, message: 'Resposta inesperada da IA.' };
  } catch (e: any) {
    console.error('Erro no teste de conexão:', e.message);
    return { success: false, message: `Falha na conexão: ${e.message}` };
  }
}

/**
 * Analisa a foto de um romaneio e extrai os dados estruturados.
 * Utiliza múltiplos modelos em fallback para garantir disponibilidade.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  const modelsToTry = [
    'googleai/gemini-1.5-flash',
    'gemini-1.5-flash',
    'googleai/gemini-1.5-flash-latest'
  ];
  
  let lastError: any = null;

  for (const modelId of modelsToTry) {
    try {
      const { output } = await ai.generate({
        model: modelId,
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
      console.error(`Falha ao tentar modelo ${modelId}:`, error.message);
      lastError = error;
      // Se não for um erro de modelo não encontrado (404), interrompe o loop
      if (!error.message?.includes('404') && !error.message?.includes('not found')) break;
    }
  }

  throw new Error(`IA Indisponível: O modelo Gemini 1.5 Flash não está respondendo na sua região. Detalhe: ${lastError?.message || 'Erro desconhecido'}`);
}
