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
    valorTotal: z.number().describe("O valor total desta linha (quantidade * preço unitário). Procure pela coluna 'Total' ou 'Valor Total'."),
});

const ParseRomaneioOutputSchema = z.object({
  items: z.array(ParsedItemSchema).describe("Lista de produtos encontrados."),
  fornecedorNome: z.string().optional().describe("Nome do fornecedor/emitente se visível."),
  dataVencimento: z.string().optional().describe("Data de vencimento da nota em formato YYYY-MM-DD."),
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
Sua tarefa é analisar a imagem e extrair os produtos, quantidades e valores totais de cada item.

Identifique:
1. Nome do Fornecedor (Emitente).
2. Data de Vencimento (YYYY-MM-DD). Se houver várias parcelas, pegue a primeira.
3. Lista de Itens:
   - Extraia o nome do produto.
   - Extraia a quantidade.
   - Extraia o VALOR TOTAL da linha (não use o preço unitário como total). Procure pela coluna 'Valor Total', 'Custo Total' ou 'Total'.

Importante: Ignore impostos gerais, totais da nota inteira ou rodapés. Foque apenas nas linhas de produtos.

Imagem para análise:
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
      if (!output) throw new Error("A IA não retornou dados válidos.");
      return output;
    } catch (error: any) {
      console.error("Erro no processamento do romaneio:", error.message);
      throw new Error(`Falha ao ler romaneio: ${error.message}`);
    }
  }
);
