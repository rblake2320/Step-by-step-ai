import { GoogleGenAI } from "@google/genai";
import { ModelId, LLMProvider } from '../types';

/**
 * Creates a promise that rejects after the specified timeout
 * @param ms Timeout in milliseconds
 * @returns Promise that rejects with timeout error
 */
const createTimeout = (ms: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms);
  });
};

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise that rejects if timeout is reached
 */
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([promise, createTimeout(timeoutMs)]);
};

// --- Gemini Provider ---
class GeminiProvider implements LLMProvider {
  id = ModelId.GEMINI_3;
  name = "Gemini 3.0 Pro";
  description = "Advanced reasoning via Google GenAI SDK";
  isLocal = false;
  private readonly timeout = 60000; // 60 second timeout

  async generate(prompt: string, systemInstruction: string, context: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing GEMINI_API_KEY environment variable. " +
        "Please set it in your .env.local file. " +
        "Get your key from: https://aistudio.google.com/app/apikey"
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
      // Using the guidance specific model for "Complex Text Tasks"
      const generationPromise = ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Context:\n${context}\n\nTask:\n${prompt}`,
        config: {
          systemInstruction: systemInstruction,
          thinkingConfig: { thinkingBudget: 1024 }, // Enable thinking for complex reasoning
        }
      });

      // Add timeout wrapper
      const response = await withTimeout(generationPromise, this.timeout);

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new Error("Empty or invalid response from Gemini API");
      }
      return text;
    } catch (error: unknown) {
      // Enhanced error handling with specific error messages
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error(`Gemini API request timed out after ${this.timeout/1000} seconds. Please try again.`);
        }
        if (error.message.includes('API key')) {
          throw new Error(`Authentication failed: ${error.message}`);
        }
        if (error.message.includes('quota') || error.message.includes('rate limit')) {
          throw new Error('API rate limit exceeded. Please wait a moment and try again.');
        }
        throw new Error(`Gemini API Error: ${error.message}`);
      }
      throw new Error('Unknown error occurred during Gemini API call');
    }
  }
}

/**
 * Mock Provider for External APIs (Claude/Llama/HuggingFace)
 * In a production environment, these would make fetch calls to:
 * - Claude: Anthropic API (cloud)
 * - Llama: localhost:11434 (Ollama)
 * - HuggingFace: Transformers API
 */
class MockExternalProvider implements LLMProvider {
  constructor(
    public id: ModelId,
    public name: string,
    public description: string,
    public isLocal: boolean
  ) {}

  async generate(prompt: string, systemInstruction: string, context: string): Promise<string> {
    // Simulate realistic network latency (500ms for local, 1500ms for cloud)
    const latency = this.isLocal ? 500 : 1500;
    await new Promise(resolve => setTimeout(resolve, latency));

    const prefix = this.isLocal ? "[LOCAL SIMULATED]" : "[CLOUD API SIMULATED]";
    return `${prefix} Response from ${this.name}\n\nPrompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"\n\nContext length: ${context.length} characters\n\nThis is a placeholder response demonstrating that the modular LLM architecture successfully routed the request to the ${this.id} provider. In a production environment, this would connect to the actual model endpoint and return real inference results.`;
  }
}

// --- Factory ---
class LLMService {
  private providers: Map<ModelId, LLMProvider> = new Map();

  constructor() {
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new MockExternalProvider(ModelId.CLAUDE_3, "Claude 3 Opus", "Anthropic", false));
    this.registerProvider(new MockExternalProvider(ModelId.LLAMA_3, "Llama 3", "Ollama/Local", true));
    this.registerProvider(new MockExternalProvider(ModelId.HF_TRANSFORMERS, "HF Transformers", "Hugging Face", true));
  }

  registerProvider(provider: LLMProvider) {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: ModelId): LLMProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Model provider ${id} not found.`);
    }
    return provider;
  }

  async executeStep(modelId: ModelId, prompt: string, systemInstruction: string, context: string): Promise<string> {
    const provider = this.getProvider(modelId);
    return await provider.generate(prompt, systemInstruction, context);
  }
}

export const llmService = new LLMService();