import axios from 'axios';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const MODEL = 'mistral';

interface OllamaResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
}

export const generateCompletion = async (prompt: string, systemPrompt?: string): Promise<string> => {
    try {
        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
        
        const response = await axios.post<OllamaResponse>(
            `${OLLAMA_BASE_URL}/api/generate`,
            {
                model: MODEL,
                prompt: fullPrompt,
                stream: false,
                format: 'json', // Ensures Mistral tries to return valid JSON
                options: {
                    temperature: 0.2, // Low temperature for more analytical/deterministic output
                }
            },
            {
                timeout: 300000 // 5 minutes timeout, complex financial prompts take time on local hardware
            }
        );

        return response.data.response;
    } catch (error: any) {
        const detail = error.response?.data?.error || error.message;
        console.error('Ollama Generation Error:', detail);
        throw new Error(`Ollama Error: ${detail}`);
    }
};
