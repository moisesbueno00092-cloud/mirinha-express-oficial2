'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando Gemini 2.0 Flash.
 * 
 * Este fluxo utiliza o modelo mais recente para ler imagens de romaneios
 * e extrair dados estruturados (produtos, quantidades e valores).
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
 * Utiliza o identificador 'googleai/gemini-2.0-flash' para maior precisão e velocidade.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    // Chamada direta ao modelo Gemini 2.0 Flash
    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt: [
        { text: `Você é um especialista em leitura de notas fiscais e romaneios de mercadorias no Brasil.
        Sua tarefa é extrair:
        1. Nome do fornecedor (empresa vendedora).
        2. Data de vencimento da fatura (se houver, no formato YYYY-MM-DD).
        3. Lista de produtos, com nome, quantidade e valor total da linha.

        IMPORTANTE: Retorne APENAS um objeto JSON puro e válido. Não inclua explicações ou blocos de código.
        
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
        temperature: 0.1, // Baixa temperatura para maior precisão nos dados numéricos
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("A IA não retornou nenhum texto de resposta.");
    }

    // Limpeza de possíveis blocos de código markdown na resposta
    const cleanedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanedJson);
      return ParseRomaneioOutputSchema.parse(parsed);
    } catch (parseError) {
      console.error("Erro ao converter resposta em JSON. Texto recebido:", text);
      throw new Error("Os dados retornados pela IA não estão num formato válido.");
    }

  } catch (error: any) {
    // Log detalhado no servidor para diagnóstico
    console.error("DETALHES DO ERRO IA (METADADOS):");
    console.dir(error, { depth: null });

    if (error.message?.includes('404') || error.message?.includes('NOT_FOUND')) {
      throw new Error(`O modelo Gemini 2.0 Flash não foi encontrado ou não está disponível na sua região.`);
    }
    
    throw new Error(`Falha no processamento: ${error.message}`);
  }
}
