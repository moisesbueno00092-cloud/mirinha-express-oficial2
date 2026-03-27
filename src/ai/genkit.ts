import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * Configuração do Genkit utilizando o plugin Google AI.
 * Prioriza a chave da Vercel (NEXT_PUBLIC_GEMINI_API_KEY) para garantir o funcionamento em produção.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
    })
  ],
});
