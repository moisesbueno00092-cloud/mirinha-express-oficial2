'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando o modelo 1.5 Flash.
 * Otimizado para estabilidade em ambientes Vercel e tratamento de erros de precondição.
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
 * Verifica se a chave de API está a funcionar corretamente no servidor.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: 'Responda apenas OK.',
    });

    if (response.text?.includes('OK')) {
      return { success: true, message: 'IA Conectada com sucesso via Gemini 1.5 Flash!' };
    }
    return { success: false, message: 'A IA respondeu, mas o formato foi inesperado.' };
  } catch (error: any) {
    console.error("ERRO TESTE CONEXÃO:", error);
    return { success: false, message: `Erro de conexão: ${error.message}` };
  }
}

/**
 * Processa a imagem do romaneio e retorna os dados extraídos.
 * Utiliza o modelo estável 1.5 Flash para máxima compatibilidade.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const { output } = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: [
        { text: `Você é um assistente especializado em romaneios de restaurante. 
        Analise a imagem e extraia:
        1. Nome do Fornecedor (se legível).
        2. Data de Vencimento (YYYY-MM-DD).
        3. Itens: nome, quantidade e valor total da linha.

        Retorne os dados rigorosamente no formato JSON solicitado.` },
        { media: { url: input.romaneioPhoto, contentType: 'image/jpeg' } }
      ],
      output: {
        schema: ParseRomaneioOutputSchema
      },
      config: {
        temperature: 0.1,
      }
    });

    if (!output) throw new Error("A IA não retornou dados estruturados.");
    return output;

  } catch (error: any) {
    // LOG DE DIAGNÓSTICO PARA VERCEL
    console.error("DETALHES DO ERRO NA IA (VERCEL/LOCAL):", error);
    
    if (error.message?.includes('FAILED_PRECONDITION')) {
        throw new Error("Erro de Configuração (FAILED_PRECONDITION): A sua chave de API pode estar restrita a uma região diferente da Vercel ou o faturamento não está ativo na Google Cloud Console.");
    }
    
    if (error.message?.includes('429')) {
        throw new Error("Quota excedida. Por favor, aguarde 1 minuto antes de tentar novamente.");
    }

    if (error.message?.includes('404')) {
        throw new Error("Modelo não encontrado. Verifique se a sua chave de API tem acesso ao Gemini 1.5 Flash.");
    }
    
    throw new Error(`Falha ao ler imagem: ${error.message}`);
  }
}
