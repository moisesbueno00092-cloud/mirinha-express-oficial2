
'use server';

/**
 * @fileOverview Parses items from a delivery note (romaneio) image.
 *
 * This file exports:
 * - `parseRomaneio`: A function that extracts product details from an image of a delivery note.
 * - `ParseRomaneioInput`: The input type for the `parseRomaneio` function.
 * - `ParseRomaneioOutput`: The output type for the `parseRomaneio` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ParseRomaneioInputSchema = z.object({
  romaneioPhoto: z
    .string()
    .describe(
      "A photo of a delivery note or invoice, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ParseRomaneioInput = z.infer<typeof ParseRomaneioInputSchema>;


const ParsedItemSchema = z.object({
    produtoNome: z.string().describe("The full name of the product."),
    quantidade: z.number().describe("The quantity of the product."),
    valorTotal: z.number().describe("The total price for the line item (quantity * unit price)."),
});

const ParseRomaneioOutputSchema = z.object({
  items: z.array(ParsedItemSchema).describe("An array of items found in the delivery note."),
  fornecedorNome: z.string().optional().describe("The name of the supplier/issuer of the note if clearly visible."),
  dataVencimento: z.string().optional().describe("The due date (vencimento) of the note if found, in YYYY-MM-DD format."),
});
export type ParseRomaneioOutput = z.infer<typeof ParseRomaneioOutputSchema>;


export async function parseRomaneio(input: ParseRomaneioInput): Promise<ParseRomaneioOutput> {
  return parseRomaneioFlow(input);
}

const parseRomaneioPrompt = ai.definePrompt({
  name: 'parseRomaneioPrompt',
  input: {schema: ParseRomaneioInputSchema},
  output: {schema: ParseRomaneioOutputSchema},
  prompt: `You are an expert OCR assistant specialized in reading Brazilian invoices and delivery notes (romaneios).
Your task is to analyze the provided image and extract a list of all products, their quantities, and their total prices for each line.

Additionally, try to identify:
1. The Supplier Name (Fornecedor/Emitente): Usually found at the very top, next to a CNPJ or logo.
2. The Due Date (Data de Vencimento): Look for labels like 'Vencimento', 'Pagar em', 'Data Vcto'. If multiple installments exist, pick the first one.

- Identify each product line item.
- For each item, extract the product name, the quantity, and the total value for that line.
- CRITICAL: You must look for a column named 'valor total', 'custo total', or simply 'total' to get the final price for the line. Do NOT use the unit price column for the final value.
- The product name should be as descriptive as possible from the note.
- Quantity is often abbreviated as 'Qtd' or 'Qtde'.
- Ignore overall taxes, totals for the entire note, subtotals, and any other information that is not a product line item.
- Ensure all extracted values are converted to the correct numeric types.
- If you find a due date, return it in YYYY-MM-DD format.

Analyze the following delivery note:
{{media url=romaneioPhoto}}
  `,
});


const parseRomaneioFlow = ai.defineFlow(
  {
    name: 'parseRomaneioFlow',
    inputSchema: ParseRomaneioInputSchema,
    outputSchema: ParseRomaneioOutputSchema,
  },
  async (input) => {
    const MAX_RETRIES = 5;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const { output } = await parseRomaneioPrompt(input);
        return output!;
      } catch (error: any) {
        const isRateLimitError = error.message && (error.message.includes('429') || /rate limit/i.test(error.message));
        
        if (isRateLimitError) {
          if (i < MAX_RETRIES - 1) {
            const retryMatch = error.message.match(/retry in ([\d.]+)s/i);
            let waitMs = 60 * 1000; // Default to 60 seconds

            if (retryMatch && retryMatch[1]) {
              const retryAfterSeconds = parseFloat(retryMatch[1]);
              waitMs = (retryAfterSeconds + 2) * 1000; // Add 2s buffer
            }

            console.log(`Rate limit hit on parseRomaneioFlow. Retrying in ${waitMs / 1000}s. Attempt ${i + 2}/${MAX_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue; // Continue to the next iteration of the loop to retry
          }
        }
        // If it's not a rate limit error, or if max retries are reached, throw the error.
        console.error(`Failed to parse romaneio after ${i + 1} attempts. Error: ${error.message}`);
        throw error;
      }
    }
     // This part should be unreachable if the loop is structured correctly, but it's here for type safety.
    throw new Error('Flow failed to produce an output after all retries.');
  }
);
