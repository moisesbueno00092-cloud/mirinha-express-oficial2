
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {config} from 'dotenv';

config();

/**
 * Configuração central do Genkit otimizada para o Restaurante da Mirinha.
 * Utiliza o modelo Gemini 1.5 Flash para máxima velocidade e baixo custo.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  ],
  model: 'googleai/gemini-1.5-flash',
});
