import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {config} from 'dotenv';

config();

/**
 * Configuração do Genkit utilizando o plugin Google AI.
 * Configuração simplificada para permitir que o plugin utilize os endpoints
 * mais adequados para os modelos da família Gemini 2.0 e 1.5.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  ],
});
