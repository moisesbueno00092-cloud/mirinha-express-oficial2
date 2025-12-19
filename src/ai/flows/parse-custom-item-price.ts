'use server';

/**
 * @fileOverview Parses a custom item price from a text input string.
 *
 * This file exports:
 * - `parseCustomItemPrice`: A function that attempts to extract a custom price from an item name string.
 * - `ParseCustomItemPriceInput`: The input type for the `parseCustomItemPrice` function.
 * - `ParseCustomItemPriceOutput`: The output type for the `parseCustomItemPrice` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ParseCustomItemPriceInputSchema = z.object({
  itemName: z.string().describe('The name of the item, potentially including a custom price.'),
});
export type ParseCustomItemPriceInput = z.infer<typeof ParseCustomItemPriceInputSchema>;

const ParseCustomItemPriceOutputSchema = z.object({
  itemName: z.string().describe('The name of the item with the price removed.'),
  customPrice: z.number().optional().describe('The custom price of the item if specified, otherwise undefined.'),
});
export type ParseCustomItemPriceOutput = z.infer<typeof ParseCustomItemPriceOutputSchema>;

export async function parseCustomItemPrice(input: ParseCustomItemPriceInput): Promise<ParseCustomItemPriceOutput> {
  return parseCustomItemPriceFlow(input);
}

const parseCustomItemPricePrompt = ai.definePrompt({
  name: 'parseCustomItemPricePrompt',
  input: {schema: ParseCustomItemPriceInputSchema},
  output: {schema: ParseCustomItemPriceOutputSchema},
  prompt: `You are an expert at parsing item names and prices from a text string.

  If the item name starts with 'M ', 'F ', 'Fr ', or 'R ' followed by a number, extract the number as the custom price and return the item name without the price.
  If the item name does not contain a custom price, return the original item name and leave the customPrice field empty.

  Here are some examples:
  - Input: 'M 12.00 Item Name', Output: { itemName: 'Item Name', customPrice: 12.00 }
  - Input: 'F 15.50 Another Item', Output: { itemName: 'Another Item', customPrice: 15.50 }
  - Input: 'Fr 20.00 Yet Another Item', Output: { itemName: 'Yet Another Item', customPrice: 20.00 }
  - Input: 'R 25.00 A Final Item', Output: { itemName: 'A Final Item', customPrice: 25.00 }
  - Input: 'Regular Item', Output: { itemName: 'Regular Item', customPrice: null }

  Parse the following item name:
  Item Name: {{{itemName}}}
  `,
});

const parseCustomItemPriceFlow = ai.defineFlow(
  {
    name: 'parseCustomItemPriceFlow',
    inputSchema: ParseCustomItemPriceInputSchema,
    outputSchema: ParseCustomItemPriceOutputSchema,
  },
  async input => {
    const {output} = await parseCustomItemPricePrompt(input);
    return output!;
  }
);
