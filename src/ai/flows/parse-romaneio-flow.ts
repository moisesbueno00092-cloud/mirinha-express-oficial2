'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando Gemini 1.5 Flash.
 * Modelo configurado para máxima compatibilidade e estabilidade em produção.
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

// Identificador universal e mais estável do modelo Gemini 1.5 Flash
const STABLE_MODEL = 'googleai/gemini-1.5-flash';

/**
 * Testa a conexão com a IA utilizando o modelo padrão.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: STABLE_MODEL,
      prompt: 'Responda apenas "CONECTADO".',
    });

    if (response.text?.includes('CONECTADO')) {
      return { success: true, message: 'Ligação estabelecida com sucesso!' };
    }
    return { success: false, message: 'Resposta inesperada da IA.' };
  } catch (error: any) {
    console.error("ERRO TESTE CONEXÃO:", error);
    
    if (error.message?.includes('404')) {
        return { 
            success: false, 
            message: 'Erro 404: Modelo não encontrado. Verifique se a API "Generative Language" está ativa no seu Google AI Studio.' 
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

    if (!output) throw new Error("A IA não conseguiu extrair dados da imagem.");
    return output;

  } catch (error: any) {
    console.error("ERRO PROCESSAMENTO IA:", error);
    
    if (error.message?.includes('404')) {
        throw new Error("Modelo Gemini 1.5 Flash não encontrado. Verifique se a API 'Generative Language' está ativa no seu painel Google Cloud/AI Studio.");
    }

    if (error.message?.includes('429')) {
        throw new Error("Quota da IA excedida. Tente novamente em um minuto.");
    }
    
    if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED')) {
        throw new Error("Acesso Negado: Verifique se a sua Chave de API é válida e tem permissões para o modelo Flash.");
    }
    
    throw new Error(`Falha na IA: ${error.message}`);
  }
}
