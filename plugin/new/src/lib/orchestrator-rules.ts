/**
 * Core orchestrator rules — injected into the master's context
 * when executing a workflow. These are the BMad execution engine rules.
 */

export const ORCHESTRATOR_RULES = `## BMad Workflow Execution Rules

You are now executing a BMad workflow. Follow these rules EXACTLY.

### Core Mandates
- **Always read COMPLETE files** — NEVER use offset/limit when reading workflow files
- **Execute ALL steps in instructions IN EXACT ORDER**
- **NEVER skip a step** — you are responsible for every step's execution
- **ALWAYS call \`bmad_init_project\` before starting any workflow** — NEVER create project directories manually

### Step-File Architecture
- **Just-In-Time Loading**: Only the current step file is in context. Never load future steps.
- **Sequential Enforcement**: Steps must be completed in order, no skipping.
- **State Tracking**: After completing each step, call \`bmad_save_artifact\` to persist output.

### Step Processing Rules
1. **READ COMPLETELY**: Read the entire step content before taking any action
2. **FOLLOW SEQUENCE**: Execute all numbered sections in order, never deviate
3. **SAVE STATE**: Call \`bmad_save_artifact\` when a step produces output (content is appended incrementally — each step adds its section)
4. **LOAD NEXT**: When ready for the next step, call \`bmad_load_step\` — do NOT try to read step files directly

### Critical Rules (NO EXCEPTIONS)
- 🛑 **NEVER** process multiple steps simultaneously
- 📖 **ALWAYS** read the entire step content before execution
- 🚫 **NEVER** skip steps or optimize the sequence
- 🎯 **ALWAYS** follow the exact instructions in the step content
- 📋 **NEVER** create mental todo lists from future steps

### Team & Subagent Awareness
- When AGENTS.md lists recommended subagents for your role, prefer spawning those for specialized tasks
- When AGENTS.md lists available skills, invoke them when the task matches
- If no AGENTS.md exists, proceed normally without subagent delegation
`;

export const YOLO_MODE_RULES = `### YOLO Mode Active
- Skip all confirmations and elicitation
- Minimize prompts
- Produce workflow output automatically by simulating expert user responses
- When a step presents a menu with [A]/[C]/[P]/[Y] options, automatically select [C] Continue
- Do NOT halt at checkpoints — proceed directly to the next step
- After completing each step's output, immediately call \`bmad_load_step\` for the next step
`;

export const NORMAL_MODE_RULES = `### Normal Mode Active
- Full user interaction and confirmation at EVERY step
- When a step presents a menu with [A]/[C]/[P]/[Y] options, HALT and present the menu to the user
- Wait for user input before proceeding to the next step
- User options at checkpoints:
  - [A] Advanced Elicitation — deep-dive into current section
  - [C] Continue — proceed to next step
  - [P] Party Mode — multi-agent group discussion (present multiple perspectives)
  - [Y] YOLO — auto-complete the rest without further prompts
`;
