import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  Plus,
  CheckCircle,
  AlertCircle,
  Terminal,
  Cpu
} from 'lucide-react';
import { 
  WorkflowState, 
  WorkflowStep, 
  StepStatus, 
  ModelId, 
  ExecutionMode, 
  LogEntry 
} from './types';
import { INITIAL_STEPS, MODEL_INFO, SYSTEM_INSTRUCTION } from './constants';
import { llmService } from './services/llmService';
import MetricsVis from './components/MetricsVis';

/**
 * Helper for persistence - loads workflow state from localStorage
 * Falls back to default state if localStorage is unavailable or corrupted
 */
const loadState = (): WorkflowState => {
  try {
    const saved = localStorage.getItem('nexus_flow_state_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate that parsed state has required properties
      if (parsed.steps && Array.isArray(parsed.steps) && parsed.selectedModel) {
        return parsed;
      }
      console.warn("Saved state is invalid, using default state");
    }
  } catch (e) {
    console.error("Failed to load saved state from localStorage:", e);
    // Optionally show user notification that state was reset
  }

  // Default state
  return {
    steps: INITIAL_STEPS,
    currentStepIndex: 0,
    selectedModel: ModelId.GEMINI_3,
    executionMode: 'step',
    isProcessing: false,
    history: []
  };
};

const App: React.FC = () => {
  const [state, setState] = useState<WorkflowState>(loadState);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistence Effect with error handling
  useEffect(() => {
    try {
      localStorage.setItem('nexus_flow_state_v1', JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state to localStorage:", e);
      // Could show user notification about save failure
    }
  }, [state]);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.history]);

  /**
   * Add a log entry to the system log history
   * Automatically limits history to last 500 entries to prevent memory leak
   * @param message Log message text
   * @param level Log severity level (info, success, warn, error)
   * @param details Optional additional details
   */
  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info', details?: string) => {
    setState(prev => {
      const newHistory = [
        ...prev.history,
        { id: Date.now().toString(), timestamp: Date.now(), level, message, details }
      ];
      return {
        ...prev,
        history: newHistory.slice(-500)
      };
    });
  }, []);

  /**
   * Update a specific workflow step with partial updates
   * @param index Step index to update
   * @param updates Partial step properties to merge
   */
  const updateStep = useCallback((index: number, updates: Partial<WorkflowStep>) => {
    setState(prev => {
      const newSteps = [...prev.steps];
      newSteps[index] = { ...newSteps[index], ...updates };
      return { ...prev, steps: newSteps };
    });
  }, []);

  /**
   * Reset the entire workflow to initial state
   * Preserves log history but clears all step results and progress
   */
  const handleReset = () => {
    if (window.confirm("Reset workflow? History will be preserved in logs.")) {
       setState(prev => ({
        ...prev,
        currentStepIndex: 0,
        steps: prev.steps.map(s => ({
          ...s,
          status: StepStatus.PENDING,
          result: undefined,
          error: undefined,
          latency: undefined,
          feedback: undefined
        })),
        isProcessing: false,
      }));
      addLog("Workflow reset initiated.", 'warn');
    }
  };

  /**
   * Execute a workflow step by calling the selected LLM provider
   * Handles context gathering, feedback integration, timeout, and error handling
   * @param index Index of the step to execute
   */
  const executeStep = useCallback(async (index: number) => {
    // Use functional state update to avoid stale closure
    setState(prev => {
      const step = prev.steps[index];
      if (!step) return prev;

      // Mark as running
      const newSteps = [...prev.steps];
      newSteps[index] = { ...step, status: StepStatus.RUNNING, modelUsed: prev.selectedModel };

      return { ...prev, steps: newSteps, isProcessing: true };
    });

    // Get current state snapshot for async work
    const currentState = state;
    const step = currentState.steps[index];
    if (!step) return;

    addLog(`Starting Step ${index + 1}: ${step.title}`, 'info');
    const startTime = Date.now();

    try {
      // Gather Context from current state snapshot
      const previousContext = currentState.steps
        .slice(0, index)
        .filter(s => s.status === StepStatus.COMPLETED && s.result)
        .map(s => `[Step: ${s.title}]\nResult: ${s.result}`)
        .join('\n\n');

      // Add feedback if exists (Human in the loop adjustment)
      let finalPrompt = step.prompt;
      if (step.feedback) {
        // Validate and sanitize feedback (max 2000 chars)
        const sanitizedFeedback = step.feedback.trim().slice(0, 2000);
        finalPrompt += `\n\nIMPORTANT USER FEEDBACK: ${sanitizedFeedback}`;
        addLog(`Applied user feedback to prompt`, 'info');
      }

      // Call Service with timeout
      const result = await llmService.executeStep(
        currentState.selectedModel,
        finalPrompt,
        SYSTEM_INSTRUCTION,
        previousContext
      );

      const latency = Date.now() - startTime;
      updateStep(index, {
        status: StepStatus.PAUSED, // Pause for feedback by default as per requirements
        result,
        latency
      });
      addLog(`Step ${index + 1} execution successful. Latency: ${latency}ms`, 'success');

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      updateStep(index, { status: StepStatus.ERROR, error: errorMessage });
      addLog(`Error in Step ${index + 1}: ${errorMessage}`, 'error', error instanceof Error ? error.stack : undefined);
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [state]);

  /**
   * Approve current step and continue to the next step in the workflow
   * Marks the current step as COMPLETED and advances the workflow index
   */
  const handleContinue = useCallback(() => {
    updateStep(state.currentStepIndex, { status: StepStatus.COMPLETED });

    const nextIndex = state.currentStepIndex + 1;
    if (nextIndex < state.steps.length) {
      setState(prev => ({ ...prev, currentStepIndex: nextIndex }));
      addLog(`Advanced to Step ${nextIndex + 1}. Ready to execute.`, 'info');
    } else {
      addLog("Workflow successfully completed! All steps finished.", 'success');
    }
  }, [state.currentStepIndex, updateStep, addLog]);

  /**
   * Trigger execution of the current active step
   */
  const handleRunClick = useCallback(() => {
    if (state.currentStepIndex >= state.steps.length) {
      addLog("All steps have been completed. Reset workflow to start over.", 'warn');
      return;
    }
    executeStep(state.currentStepIndex);
  }, [state.currentStepIndex, state.steps.length, executeStep, addLog]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-200 font-sans">
      
      {/* Sidebar - Configuration */}
      <aside className="w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary-500" />
          <h1 className="text-lg font-bold tracking-tight text-white">NexusFlow 2025</h1>
        </div>

        <div className="p-4 space-y-6 flex-1 overflow-y-auto">
          
          {/* Model Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Active Inference Model</label>
            <div className="grid gap-2">
              {Object.values(ModelId).map((id) => (
                <button
                  key={id}
                  onClick={() => setState(prev => ({ ...prev, selectedModel: id }))}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                    state.selectedModel === id 
                      ? 'bg-primary-600/20 border-primary-500/50 text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                      : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xl">{MODEL_INFO[id].icon}</span>
                  <div>
                    <div className="font-medium text-sm">{MODEL_INFO[id].name}</div>
                    <div className="text-[10px] opacity-70">{MODEL_INFO[id].description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Execution Mode */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Granularity</label>
            <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800">
              {(['step', 'batch', 'all'] as ExecutionMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setState(prev => ({ ...prev, executionMode: mode }))}
                  className={`flex-1 py-1.5 text-xs font-medium rounded capitalize transition-colors ${
                    state.executionMode === mode 
                      ? 'bg-slate-700 text-white shadow-sm' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 px-1">
              Controls how many steps run before forcing a pause.
            </p>
          </div>

          <MetricsVis steps={state.steps} />
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleReset}
            className="flex items-center justify-center gap-2 w-full p-2 text-xs text-red-400 hover:bg-red-950/30 rounded border border-transparent hover:border-red-900 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset Workflow State
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
               state.isProcessing 
               ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
               : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${state.isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              {state.isProcessing ? 'Inference Running...' : 'System Ready'}
            </span>
          </div>

          <div className="flex items-center gap-2">
             <div className="text-xs text-slate-500 mr-4">
               Progress: {state.currentStepIndex} / {state.steps.length}
             </div>
          </div>
        </header>

        {/* Workflow Board */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {state.steps.map((step, index) => {
            const isActive = index === state.currentStepIndex;
            const isPast = index < state.currentStepIndex;
            const isPaused = step.status === StepStatus.PAUSED;

            return (
              <div 
                key={step.id} 
                className={`relative rounded-xl border transition-all duration-300 ${
                  isActive 
                    ? 'bg-slate-900/80 border-primary-500/50 shadow-lg shadow-primary-900/20 ring-1 ring-primary-500/20' 
                    : isPast 
                      ? 'bg-slate-900/30 border-slate-800 opacity-70 hover:opacity-100' 
                      : 'bg-slate-900/10 border-slate-800/50 opacity-50'
                }`}
              >
                {/* Step Header */}
                <div className="flex items-start justify-between p-5">
                   <div className="flex items-start gap-4">
                      <div className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                        step.status === StepStatus.COMPLETED ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' :
                        step.status === StepStatus.ERROR ? 'border-red-500 bg-red-500/10 text-red-500' :
                        isActive ? 'border-primary-500 bg-primary-500 text-slate-950' :
                        'border-slate-700 bg-slate-800 text-slate-500'
                      }`}>
                        {step.status === StepStatus.COMPLETED ? <CheckCircle className="w-3.5 h-3.5" /> : index + 1}
                      </div>
                      <div>
                        <h3 className={`font-medium text-base ${isActive ? 'text-white' : 'text-slate-300'}`}>
                          {step.title}
                        </h3>
                        <div className="mt-1 text-sm text-slate-400 font-mono bg-slate-950/50 px-2 py-1 rounded border border-slate-800 inline-block max-w-2xl truncate">
                          {step.prompt}
                        </div>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-2">
                     {step.modelUsed && (
                       <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                         {MODEL_INFO[step.modelUsed].name}
                       </span>
                     )}
                   </div>
                </div>

                {/* Result Area */}
                {(step.result || step.error) && (
                  <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-2">
                    <div className={`rounded-lg p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto custom-scrollbar ${
                      step.error ? 'bg-red-950/20 border border-red-900/50 text-red-200' : 'bg-slate-950 border border-slate-800 text-slate-300'
                    }`}>
                      {step.error || step.result}
                    </div>
                  </div>
                )}

                {/* Action Bar for Active Step */}
                {isActive && (
                  <div className="px-5 pb-5 pt-0 flex items-center justify-between gap-4">
                    {step.status === StepStatus.RUNNING ? (
                       <div className="flex items-center gap-2 text-sm text-primary-400 animate-pulse">
                         <Cpu className="w-4 h-4" /> Processing...
                       </div>
                    ) : isPaused ? (
                      <div className="flex-1 flex flex-col gap-3 bg-primary-900/10 border border-primary-500/30 p-3 rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-primary-300 font-medium">
                          <AlertCircle className="w-4 h-4" />
                          Human-in-the-Loop: Review & Feedback
                        </div>
                        <textarea 
                          className="w-full bg-slate-950/50 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:border-primary-500 focus:outline-none"
                          placeholder="Everything looks good? Or type feedback to refine before continuing..."
                          rows={2}
                          value={step.feedback || ''}
                          onChange={(e) => updateStep(index, { feedback: e.target.value })}
                        />
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => executeStep(index)} // Re-run with feedback
                            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
                          >
                            Iterate / Re-run
                          </button>
                          <button 
                            onClick={handleContinue}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-500 rounded shadow-lg shadow-primary-900/20 flex items-center gap-1.5"
                          >
                            <CheckCircle className="w-3 h-3" /> Approve & Continue
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleRunClick}
                        disabled={state.isProcessing}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-primary-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className="w-4 h-4" /> Start Step
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Step Placeholder */}
          <div className="border-2 border-dashed border-slate-800 rounded-xl p-6 text-center hover:border-slate-700 transition-colors cursor-pointer group">
             <div className="flex flex-col items-center gap-2 text-slate-600 group-hover:text-slate-400">
               <Plus className="w-8 h-8" />
               <span className="text-sm font-medium">Add Custom Step (Future Extensibility)</span>
             </div>
          </div>

        </div>

        {/* Logs Panel */}
        <div className="h-48 border-t border-slate-800 bg-slate-950 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/30 flex items-center gap-2">
            <Terminal className="w-3 h-3 text-slate-500" />
            <span className="text-xs font-semibold uppercase text-slate-500">System Logs</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]" ref={scrollRef}>
            {state.history.length === 0 && <div className="text-slate-600 italic p-2">System ready. Logs will appear here.</div>}
            {state.history.map((log) => (
              <div key={log.id} className="flex gap-2 hover:bg-slate-900/50 p-0.5 rounded">
                <span className="text-slate-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`shrink-0 font-bold ${
                  log.level === 'error' ? 'text-red-500' : 
                  log.level === 'warn' ? 'text-amber-500' : 
                  log.level === 'success' ? 'text-emerald-500' : 'text-blue-500'
                }`}>[{log.level.toUpperCase()}]</span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;