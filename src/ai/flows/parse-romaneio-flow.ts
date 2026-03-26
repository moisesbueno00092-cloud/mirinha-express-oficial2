
'use server';

/**
 * @fileOverview Extrai dados de produtos de uma imagem de romaneio (JPG/PNG).
 *
 * - parseRomaneio - Função principal que processa a imagem via IA.
 * - ParseRomaneioInput - Entrada esperada (Data URI da imagem).
 * - ParseRomaneioOutput - Dados extraídos (Itens, Fornecedor, Vencimento).
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ParseRomaneioInputSchema = z.object({
  romaneioPhoto: z
    .string()
    .describe(
      "A foto de um romaneio ou nota fiscal, como um Data URI Base64. Formato esperado: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ParseRomaneioInput = z.infer<typeof ParseRomaneioInputSchema>;

const ParsedItemSchema = z.object({
    produtoNome: z.string().describe("O nome completo e descritivo do produto."),
    quantidade: z.number().describe("A quantidade comprada."),
    valorTotal: z.number().describe("O valor total desta linha (quantidade * preço unitário)."),
});

const ParseRomaneioOutputSchema = z.object({
  items: z.array(ParsedItemSchema).describe("Lista de produtos encontrados."),
  fornecedorNome: z.string().optional().describe("Nome do fornecedor/emitente."),
  dataVencimento: z.string().optional().describe("Data de vencimento da nota (YYYY-MM-DD)."),
});
export type ParseRomaneioOutput = z.infer<typeof ParseRomaneioOutputSchema>;

export async function parseRomaneio(input: ParseRomaneioInput): Promise<ParseRomaneioOutput> {
  return parseRomaneioFlow(input);
}

const parseRomaneioPrompt = ai.definePrompt({
  name: 'parseRomaneioPrompt',
  input: {schema: ParseRomaneioInputSchema},
  output: {schema: ParseRomaneioOutputSchema},
  prompt: `Você é um assistente especializado em ler romaneios e notas fiscais brasileiras.
Sua tarefa é analisar a imagem JPG fornecida e extrair os produtos, quantidades e valores totais de cada linha.

Identifique:
1. Nome do Fornecedor (Emitente).
2. Data de Vencimento (YYYY-MM-DD). Se não houver, deixe em branco.
3. Lista de Itens:
   - Extraia o nome do produto.
   - Extraia a quantidade (número).
   - Extraia o VALOR TOTAL daquela linha.

Importante: Ignore impostos e rodapés. Foque apenas na lista de mercadorias.

Imagem do romaneio:
{{media url=romaneioPhoto}}`,
});

const parseRomaneioFlow = ai.defineFlow(
  {
    name: 'parseRomaneioFlow',
    inputSchema: ParseRomaneioInputSchema,
    outputSchema: ParseRomaneioOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await parseRomaneioPrompt(input);
      if (!output) throw new Error("A IA não conseguiu ler os dados desta imagem.");
      return output;
    } catch (error: any) {
      console.error("Erro no processamento do romaneio:", error.message);
      throw new Error(`Falha ao ler romaneio: ${error.message}`);
    }
  }
);
