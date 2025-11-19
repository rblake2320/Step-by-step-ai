export enum ModelId {
  GEMINI_3 = 'gemini-3-pro-preview',
  CLAUDE_3 = 'claude-3-opus',
  LLAMA_3 = 'llama-3-70b-instruct',
  HF_TRANSFORMERS = 'hf-transformers-latest'
}

export type ExecutionMode = 'step' | 'batch' | 'all';

export enum StepStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED', // Waiting for feedback
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface WorkflowStep {
  id: string;
  title: string;
  prompt: string;
  status: StepStatus;
  result?: string;
  error?: string;
  feedback?: string; // Human-in-the-loop feedback
  modelUsed?: ModelId;
  timestamp?: number;
  latency?: number; // ms
}

export interface WorkflowState {
  steps: WorkflowStep[];
  currentStepIndex: number;
  selectedModel: ModelId;
  executionMode: ExecutionMode;
  isProcessing: boolean;
  history: LogEntry[];
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  details?: string;
}

export interface LLMProvider {
  id: ModelId;
  name: string;
  description: string;
  generate: (prompt: string, systemInstruction?: string, context?: string) => Promise<string>;
  isLocal: boolean;
}