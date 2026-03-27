import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * Configuração central do Genkit.
 * Exporta o plugin separadamente para que possamos referenciar modelos de forma estável.
 */
export const googleAIPlugin = googleAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY,
});

export const ai = genkit({
  plugins: [googleAIPlugin],
});
