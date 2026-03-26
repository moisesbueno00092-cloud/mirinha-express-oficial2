import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {config} from 'dotenv';

config();

/**
 * Configuração do Genkit forçando a API v1 para evitar erros de endpoint v1beta.
 * Isso garante que o modelo gemini-1.5-flash seja encontrado corretamente.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
      apiVersion: 'v1'
    })
  ],
});
