'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios otimizado para Vercel.
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
 * Testa a conexão com a IA utilizando o modelo estável.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: 'Responda apenas "OK".',
    });

    if (response.text?.includes('OK')) {
      return { success: true, message: 'IA Conectada com sucesso via Gemini 1.5 Flash!' };
    }
    return { success: false, message: 'A IA respondeu, mas o formato foi inesperado.' };
  } catch (error: any) {
    console.error("ERRO TESTE CONEXÃO:", error);
    return { success: false, message: `Erro: ${error.message}` };
  }
}

/**
 * Extrai dados do romaneio via IA.
 * Utiliza o identificador canónico para evitar erros 404.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const { output } = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: [
        { text: `Você é um assistente especializado em romaneios de restaurante. 
        Analise a imagem e extraia:
        1. Nome do Fornecedor (se legível).
        2. Data de Vencimento (formato YYYY-MM-DD).
        3. Itens: nome do produto, quantidade e valor total da linha.

        Retorne os dados estritamente no formato JSON solicitado.` },
        { media: { url: input.romaneioPhoto, contentType: 'image/jpeg' } }
      ],
      output: {
        schema: ParseRomaneioOutputSchema
      },
      config: {
        temperature: 0.1,
      }
    });

    if (!output) throw new Error("A IA não conseguiu extrair dados estruturados.");
    return output;

  } catch (error: any) {
    console.error("DETALHES DO ERRO NA VERCEL:", error);
    
    // Tratamento de erros comuns de configuração
    if (error.message?.includes('404') || error.message?.includes('not found')) {
        throw new Error("Erro 404: O modelo não foi encontrado. Verifique se a sua chave de API tem acesso ao Gemini 1.5 Flash e se o plugin está na versão correta.");
    }
    
    if (error.message?.includes('FAILED_PRECONDITION')) {
        throw new Error("Erro de Configuração (FAILED_PRECONDITION): A API do Gemini pode não estar ativada no seu projeto do Google Cloud ou a sua região não é suportada.");
    }

    if (error.message?.includes('429')) {
        throw new Error("Quota excedida. Por favor, aguarde alguns segundos antes de tentar novamente.");
    }
    
    throw new Error(`Falha ao processar imagem: ${error.message}`);
  }
}
