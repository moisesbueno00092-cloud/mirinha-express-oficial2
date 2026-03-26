import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {config} from 'dotenv';

config();

/**
 * Configuração centralizada do Genkit.
 * Removemos o modelo padrão global para evitar erros de resolução de endpoint
 * e garantir que cada fluxo use a referência mais estável.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  ],
});
