'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando Gemini 1.5 Flash.
 * 
 * Este fluxo foi estabilizado para evitar erros 404 e 429, focando na leitura
 * de imagens JPG para extração de produtos, quantidades e preços.
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
 * Processa a imagem do romaneio e retorna os dados extraídos.
 * Utiliza o modelo gemini-1.5-flash para maior compatibilidade de quota.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: [
        { text: `Você é um especialista em leitura de notas fiscais e romaneios de mercadorias.
        Sua tarefa é extrair:
        1. Nome do fornecedor (empresa vendedora).
        2. Data de vencimento da fatura (se houver, no formato YYYY-MM-DD).
        3. Lista de produtos, com nome, quantidade e valor total da linha.

        IMPORTANTE: Retorne APENAS um objeto JSON puro e válido.
        
        Formato do JSON:
        {
          "items": [
            { "produtoNome": "NOME DO ITEM", "quantidade": 10, "valorTotal": 150.50 }
          ],
          "fornecedorNome": "NOME DA EMPRESA",
          "dataVencimento": "YYYY-MM-DD"
        }` },
        { media: { url: input.romaneioPhoto, contentType: 'image/jpeg' } }
      ],
      config: {
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("A IA não retornou resposta.");
    }

    // Limpeza de markdown
    const cleanedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanedJson);
      return ParseRomaneioOutputSchema.parse(parsed);
    } catch (parseError) {
      console.error("Erro no JSON da IA:", text);
      throw new Error("Formato de dados inválido retornado pela IA.");
    }

  } catch (error: any) {
    console.error("DETALHES DO ERRO IA:");
    console.dir(error, { depth: null });

    if (error.message?.includes('429')) {
      throw new Error("Limite de requisições excedido. Por favor, aguarde 30 segundos e tente novamente.");
    }
    
    if (error.message?.includes('404')) {
      throw new Error("Modelo de IA não encontrado. Verifique se o serviço está disponível na sua região.");
    }
    
    throw new Error(`Falha no processamento: ${error.message}`);
  }
}
