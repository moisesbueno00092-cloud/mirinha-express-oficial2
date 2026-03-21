
import {genkit} from 'genkit';
import {googleAI, gemini15Flash} from '@genkit-ai/google-genai';
import {config} from 'dotenv';

config();

/**
 * Configuração central do Genkit otimizada para o Restaurante da Mirinha.
 * Utiliza a referência direta gemini15Flash para evitar erros 404 de endpoint.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  ],
  model: gemini15Flash,
});
