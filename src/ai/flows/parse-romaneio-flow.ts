'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando o modelo 1.5 Flash 8B.
 * Otimizado para estabilidade em ambientes Vercel.
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
 * Verifica se a chave de API está a funcionar corretamente.
 */
export async function testAiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash-8b',
      prompt: 'Responda apenas com a palavra OK se estiver a funcionar.',
    });

    if (response.text.includes('OK')) {
      return { success: true, message: 'IA Conectada com sucesso!' };
    }
    return { success: false, message: 'A IA respondeu, mas o formato foi inesperado.' };
  } catch (error: any) {
    console.error("ERRO TESTE CONEXÃO:", error);
    if (error.message?.includes('FAILED_PRECONDITION')) {
        return { success: false, message: 'Erro de Precondição: Verifique se a sua chave de API tem permissão para esta região ou modelo.' };
    }
    return { success: false, message: `Erro de conexão: ${error.message}` };
  }
}

/**
 * Processa a imagem do romaneio e retorna os dados extraídos.
 * Utiliza o modelo 8B para máxima economia de recursos e estabilidade.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash-8b',
      prompt: [
        { text: `Você é um assistente especializado em romaneios de restaurante. 
        Analise a imagem e extraia:
        1. Nome do Fornecedor (se legível).
        2. Data de Vencimento (YYYY-MM-DD).
        3. Itens: nome, quantidade e valor total da linha.

        Responda APENAS com um JSON puro no formato:
        {
          "items": [
            { "produtoNome": "Exemplo", "quantidade": 1, "valorTotal": 10.0 }
          ],
          "fornecedorNome": "Empresa X",
          "dataVencimento": "2024-12-31"
        }` },
        { media: { url: input.romaneioPhoto, contentType: 'image/jpeg' } }
      ],
      config: {
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) throw new Error("A IA não retornou dados.");

    const cleanedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanedJson);
      return ParseRomaneioOutputSchema.parse(parsed);
    } catch (parseError) {
      console.error("JSON inválido da IA:", text);
      throw new Error("Resposta da IA ilegível. Tente uma foto mais nítida.");
    }

  } catch (error: any) {
    console.error("ERRO CRÍTICO NA IA:", error);
    
    if (error.message?.includes('429')) throw new Error("Quota excedida. Aguarde 1 minuto.");
    if (error.message?.includes('FAILED_PRECONDITION')) {
        throw new Error("Erro de Configuração (FAILED_PRECONDITION): A sua chave de API ou região pode estar restrita. Verifique as configurações na Google AI Studio.");
    }
    
    throw new Error(`Falha ao ler imagem: ${error.message}`);
  }
}
