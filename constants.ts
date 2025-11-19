import { ModelId, WorkflowStep, StepStatus } from './types';

export const INITIAL_STEPS: WorkflowStep[] = [
  {
    id: 'step-1',
    title: 'Market Analysis',
    prompt: 'Analyze the current trends in AI agent workflows as of late 2025. Summarize key adoption drivers.',
    status: StepStatus.PENDING,
  },
  {
    id: 'step-2',
    title: 'Architecture Draft',
    prompt: 'Based on the analysis, draft a high-level system architecture for a modular inference engine using Python.',
    status: StepStatus.PENDING,
  },
  {
    id: 'step-3',
    title: 'Security Review',
    prompt: 'Review the architecture for potential prompt injection vulnerabilities and suggest mitigation strategies.',
    status: StepStatus.PENDING,
  }
];

export const MODEL_INFO = {
  [ModelId.GEMINI_3]: {
    name: 'Google Gemini 3.0',
    description: 'Complex reasoning & multimodal capabilities (Preview)',
    icon: '✨',
    color: 'text-blue-400'
  },
  [ModelId.CLAUDE_3]: {
    name: 'Anthropic Claude 3',
    description: 'High-reliability nuances & long context',
    icon: '🧠',
    color: 'text-orange-400'
  },
  [ModelId.LLAMA_3]: {
    name: 'Meta Llama 3',
    description: 'Local/Offline optimized via Ollama runner',
    icon: '🦙',
    color: 'text-purple-400'
  },
  [ModelId.HF_TRANSFORMERS]: {
    name: 'HF Transformers',
    description: 'Custom pipelines from Hugging Face Hub',
    icon: '🤗',
    color: 'text-yellow-400'
  }
};

export const SYSTEM_INSTRUCTION = "You are an advanced AI workflow assistant. Execute the user's request precisely. Maintain technical accuracy.";