import { GoogleGenAI } from "@google/genai";
import { ModelId, LLMProvider } from '../types';

// --- Gemini Provider ---
class GeminiProvider implements LLMProvider {
  id = ModelId.GEMINI_3;
  name = "Gemini 3.0 Pro";
  description = "Advanced reasoning via Google GenAI SDK";
  isLocal = false;

  async generate(prompt: string, systemInstruction: string, context: string): Promise<string> {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("Missing Google GenAI API Key. Please check environment variables.");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    try {
      // Using the guidance specific model for "Complex Text Tasks"
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', 
        contents: `Context:\n${context}\n\nTask:\n${prompt}`,
        config: {
          systemInstruction: systemInstruction,
          thinkingConfig: { thinkingBudget: 1024 }, // Enable thinking for complex reasoning
        }
      });
      
      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini.");
      return text;
    } catch (error: any) {
      console.error("Gemini Generation Error:", error);
      throw new Error(`Gemini API Error: ${error.message || error}`);
    }
  }
}

// --- Mock Provider for External APIs (Claude/Llama) ---
// In a real backend, these would make fetch calls to localhost:11434 or Anthropic API
class MockExternalProvider implements LLMProvider {
  id: ModelId;
  name: string;
  description: string;
  isLocal: boolean;

  constructor(id: ModelId, name: string, description: string, isLocal: boolean) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.isLocal = isLocal;
  }

  async generate(prompt: string, systemInstruction: string, context: string): Promise<string> {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 2000));

    const prefix = this.isLocal ? "[LOCAL OFFLINE]" : "[CLOUD API]";
    return `${prefix} Response from ${this.name} (Simulated).\n\nI have analyzed the prompt: "${prompt.substring(0, 30)}..."\n\nBased on previous context of length ${context.length}, here is the result:\n\nThis is a placeholder response confirming that the modular architecture correctly routed the request to the ${this.id} driver. In a production environment, this would connect to the specific model's REST endpoint.`;
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