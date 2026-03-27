import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {config} from 'dotenv';

config();

/**
 * Configuração do Genkit utilizando o plugin Google AI.
 * Suporta tanto a variável padrão como a versão pública da Vercel.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    })
  ],
});
