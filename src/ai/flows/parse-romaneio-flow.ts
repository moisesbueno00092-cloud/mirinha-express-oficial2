'use server';

/**
 * @fileOverview Fluxo de extração de dados de romaneios utilizando Gemini 1.5 Flash 8B.
 * 
 * Este fluxo utiliza o modelo 8B como alternativa para evitar erros de quota (429)
 * e problemas de disponibilidade (404) encontrados nos modelos maiores.
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
 * Utiliza o modelo 8B para máxima compatibilidade com o plano Free Tier.
 */
export async function parseRomaneio(input: { romaneioPhoto: string }): Promise<ParseRomaneioOutput> {
  try {
    // Usamos o modelo 8B como alternativa estável
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash-8b',
      prompt: [
        { text: `Você é um assistente de entrada de mercadorias. 
        Analise a imagem deste romaneio e extraia:
        1. Nome do Fornecedor.
        2. Data de Vencimento (YYYY-MM-DD).
        3. Lista de produtos: nome, quantidade e valor total da linha.

        IMPORTANTE: Responda APENAS com um JSON puro. Não inclua blocos de código markdown (\`\`\`json).
        
        Formato:
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

    // Limpeza de possíveis caracteres extras
    const cleanedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanedJson);
      return ParseRomaneioOutputSchema.parse(parsed);
    } catch (parseError) {
      console.error("JSON inválido da IA:", text);
      throw new Error("Não foi possível entender a resposta da IA. Tente novamente com uma foto mais nítida.");
    }

  } catch (error: any) {
    console.error("DETALHES DO ERRO IA:", error);

    if (error.message?.includes('429')) {
      throw new Error("Quota excedida ou limite de requisições atingido. Por favor, aguarde 1 minuto e tente novamente.");
    }
    
    if (error.message?.includes('404')) {
      throw new Error("O modelo alternativo não foi encontrado. Verifique se a sua chave de API está ativa.");
    }
    
    throw new Error(`Falha ao ler imagem: ${error.message}`);
  }
}
