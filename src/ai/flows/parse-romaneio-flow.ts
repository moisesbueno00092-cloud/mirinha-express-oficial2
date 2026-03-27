'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios otimizado para Vercel.
 */

import { ai, googleAIPlugin } from '@/ai/genkit';
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
 * Testa a conexão com a IA utilizando a referência direta do plugin.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: googleAIPlugin.model('gemini-1.5-flash'),
      prompt: 'Responda apenas "IA ATIVA".',
    });

    if (response.text?.includes('IA ATIVA')) {
      return { success: true, message: 'Conexão estabelecida com sucesso via Gemini 1.5 Flash!' };
    }
    return { success: false, message: 'A IA respondeu, mas o conteúdo foi inesperado.' };
  } catch (error: any) {
    console.error("ERRO TESTE CONEXÃO VERCEL:", error);
    
    if (error.message?.includes('404') || error.message?.includes('not found')) {
        return { 
            success: false, 
            message: 'Erro 404: Modelo não encontrado. Verifique se ativou a "Generative Language API" no Google Cloud ou se a sua chave de API tem permissões para o modelo Flash 1.5.' 
        };
    }
    
    if (error.message?.includes('429')) {
        return { success: false, message: 'Limite de quota excedido. Aguarde alguns segundos.' };
    }

    return { success: false, message: `Erro de ligação: ${error.message}` };
  }
}

/**
 * Extrai dados do romaneio via IA utilizando a referência estável do modelo Flash.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const { output } = await ai.generate({
      model: googleAIPlugin.model('gemini-1.5-flash'),
      prompt: [
        { text: `Você é um assistente especializado em romaneios de restaurante. 
        Analise a imagem e extraia os seguintes dados em JSON:
        1. fornecedorNome: Nome da empresa vendedora.
        2. dataVencimento: Data de pagamento (formato YYYY-MM-DD).
        3. items: lista com produtoNome, quantidade e valorTotal.

        Ignore carimbos ou rasuras ilegíveis.` },
        { media: { url: input.romaneioPhoto, contentType: 'image/jpeg' } }
      ],
      output: {
        schema: ParseRomaneioOutputSchema
      },
      config: {
        temperature: 0.1,
      }
    });

    if (!output) throw new Error("A IA não conseguiu extrair dados da imagem.");
    return output;

  } catch (error: any) {
    console.error("ERRO PROCESSAMENTO IMAGEM:", error);
    
    if (error.message?.includes('404')) {
        throw new Error("Modelo não encontrado. Certifique-se que a sua chave de API suporta o Gemini 1.5 Flash.");
    }
    
    throw new Error(`Falha ao ler imagem: ${error.message}`);
  }
}
