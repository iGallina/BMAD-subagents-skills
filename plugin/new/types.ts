/**
 * BMad Method Plugin — Core Types
 * (Copied from OpenClaw plugin for local test compatibility)
 */

export interface BmadState {
  projectName: string;
  projectPath: string;
  createdAt: string;
  currentPhase: BmadPhase;
  activeWorkflow: ActiveWorkflow | null;
  completedWorkflows: CompletedWorkflow[];
}

export type BmadPhase =
  | "analysis"
  | "planning"
  | "solutioning"
  | "implementation";

export interface ActiveWorkflow {
  id: string;
  agentId: string;
  agentName: string;
  mode: "normal" | "yolo";
  currentStep: number;
  totalSteps: number | null;
  currentStepFile: string;
  outputFile: string;
  lastSavedStep?: number;
  startedAt: string;
}

export interface CompletedWorkflow {
  id: string;
  agentId: string;
  outputFile: string;
  completedAt: string;
}
