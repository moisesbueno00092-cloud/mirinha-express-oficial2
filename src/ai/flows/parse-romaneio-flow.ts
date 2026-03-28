'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios com estratégia de fallback para múltiplos modelos.
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
 * Testa a conexão com a IA utilizando os modelos disponíveis.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  const models = ['googleai/gemini-1.5-flash', 'googleai/gemini-1.5-flash-8b', 'googleai/gemini-1.5-pro'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await ai.generate({
        model,
        prompt: 'Responda apenas "OK".',
      });
      if (response.text?.includes('OK')) {
        return { success: true, message: `Conectado com sucesso via ${model}` };
      }
    } catch (e: any) {
      lastError = e.message;
      console.warn(`Falha no modelo ${model}:`, e.message);
    }
  }

  return { success: false, message: `Falha em todos os modelos. Último erro: ${lastError}` };
}

/**
 * Analisa a foto de um romaneio tentando múltiplos modelos em caso de erro 404.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  const models = ['googleai/gemini-1.5-flash', 'googleai/gemini-1.5-flash-8b', 'googleai/gemini-1.5-pro'];
  let lastError: any = null;

  for (const modelName of models) {
    try {
      const { output } = await ai.generate({
        model: modelName,
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
      lastError = error;
      console.error(`Erro no modelo ${modelName}:`, error.message);
      // Se não for erro 404 ou 429, talvez nem valha a pena tentar os outros, mas vamos tentar por segurança
    }
  }

  throw new Error(`IA Indisponível: Não foi possível conectar a nenhum modelo na sua região. Tente novamente ou use o teste de conexão. Detalhe: ${lastError?.message || 'Erro desconhecido'}`);
}
