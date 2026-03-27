'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando Gemini 1.5 Flash 8B.
 * Este modelo é otimizado para evitar erros 404 e falhas de pré-condição na Vercel.
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

// Modelo ultra-estável para evitar erro 404 em produção
const STABLE_MODEL = 'googleai/gemini-1.5-flash-8b';

/**
 * Testa a conexão com a IA utilizando o modelo de alta eficiência.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: STABLE_MODEL,
      prompt: 'Responda apenas "CONECTADO".',
    });

    if (response.text?.includes('CONECTADO')) {
      return { success: true, message: 'Ligação estabelecida com sucesso via Gemini 1.5 Flash 8B!' };
    }
    return { success: false, message: 'Resposta inesperada da IA.' };
  } catch (error: any) {
    console.error("ERRO TESTE CONEXÃO:", error);
    
    if (error.message?.includes('404')) {
        return { 
            success: false, 
            message: 'Erro 404: Modelo não encontrado. Verifique se a API "Generative Language" está ativa no seu projeto Google Cloud.' 
        };
    }
    
    if (error.message?.includes('429')) {
        return { success: false, message: 'Limite de quota excedido. Aguarde 60 segundos.' };
    }

    return { success: false, message: `Erro: ${error.message}` };
  }
}

/**
 * Extrai dados do romaneio via visão computacional.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const { output } = await ai.generate({
      model: STABLE_MODEL,
      prompt: [
        { text: `Você é um assistente especializado em romaneios de restaurante. 
        Analise a imagem e extraia os seguintes dados em JSON:
        1. fornecedorNome: Nome da empresa vendedora.
        2. dataVencimento: Data de pagamento (YYYY-MM-DD).
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

    if (!output) throw new Error("A IA não conseguiu extrair dados.");
    return output;

  } catch (error: any) {
    console.error("ERRO PROCESSAMENTO:", error);
    
    if (error.message?.includes('404')) {
        throw new Error("Modelo 8B não encontrado. Verifique a ativação da API Generative Language.");
    }

    if (error.message?.includes('429')) {
        throw new Error("Quota excedida. Tente novamente em um minuto.");
    }
    
    throw new Error(`Falha ao ler imagem: ${error.message}`);
  }
}
