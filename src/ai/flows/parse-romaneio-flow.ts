
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

- Identify each product line item.
- For each item, extract the product name, the quantity, and the total value for that line.
- CRITICAL: You must look for a column named 'valor total', 'custo total', or simply 'total' to get the final price for the line. Do NOT use the unit price column for the final value.
- The product name should be as descriptive as possible from the note.
- Quantity is often abbreviated as 'Qtd' or 'Qtde'.
- Ignore overall taxes, totals for the entire note, subtotals, and any other information that is not a product line item.
- Ensure all extracted values are converted to the correct numeric types.

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
  async input => {
    const {output} = await parseRomaneioPrompt(input);
    return output!;
  }
);

    