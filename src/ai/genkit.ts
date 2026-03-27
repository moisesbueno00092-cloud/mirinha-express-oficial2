import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * Configuração central do Genkit.
 * Utiliza o plugin Google AI com suporte a variáveis de ambiente da Vercel.
 * Não força versão de API para evitar erros 404 de endpoint.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    })
  ],
});
