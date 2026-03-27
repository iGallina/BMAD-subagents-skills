/**
 * Team Resolver — detects project tech stack and maps to recommended
 * subagents and skills for AGENTS.md generation.
 */

import { readFile, readdir, access } from "node:fs/promises";
import { join, basename } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TechStack {
  /** Detected technologies grouped by layer */
  layers: Record<string, string[]>;
  /** Flat list of all detected technology keywords */
  keywords: string[];
}

export interface SubagentMatch {
  name: string;
  category: string;
  description: string;
  reason: string;
}

export interface SkillMatch {
  name: string;
  description: string;
}

export interface TeamRecommendation {
  projectName: string;
  techStack: TechStack;
  subagents: {
    implementation: SubagentMatch[];
    quality: SubagentMatch[];
    architecture: SubagentMatch[];
  };
  skills: SkillMatch[];
}

// ── Tech ↔ Subagent Map ────────────────────────────────────────────────────

/** Maps technology keywords to recommended subagent names */
const TECH_SUBAGENT_MAP: Record<string, string[]> = {
  // Languages
  python: ["python-pro"],
  typescript: ["typescript-pro"],
  javascript: ["javascript-pro"],
  rust: ["rust-engineer"],
  go: ["golang-pro"],
  java: ["java-architect"],
  kotlin: ["kotlin-specialist"],
  swift: ["swift-expert"],
  csharp: ["csharp-developer"],
  cpp: ["cpp-pro"],
  php: ["php-pro"],
  ruby: ["rails-expert"],
  elixir: ["elixir-expert"],
  sql: ["sql-pro"],

  // Backend frameworks
  fastapi: ["python-pro", "backend-developer", "api-designer"],
  django: ["django-developer", "python-pro"],
  express: ["backend-developer", "javascript-pro"],
  nestjs: ["backend-developer", "typescript-pro"],
  "spring-boot": ["spring-boot-engineer", "java-architect"],
  laravel: ["laravel-specialist", "php-pro"],
  rails: ["rails-expert"],
  flask: ["python-pro", "backend-developer"],
  dotnet: ["dotnet-core-expert", "csharp-developer"],

  // Frontend frameworks
  react: ["react-specialist", "frontend-developer"],
  vue: ["vue-expert", "frontend-developer"],
  angular: ["angular-architect", "frontend-developer"],
  nextjs: ["nextjs-developer", "react-specialist"],
  svelte: ["frontend-developer"],
  flutter: ["flutter-expert"],

  // Databases
  postgresql: ["postgres-pro", "database-administrator"],
  postgres: ["postgres-pro", "database-administrator"],
  supabase: ["postgres-pro", "database-administrator"],
  sqlite: ["database-administrator", "sql-pro"],
  mongodb: ["database-administrator"],
  redis: ["database-administrator"],
  mysql: ["database-administrator", "sql-pro"],

  // Infrastructure
  docker: ["docker-expert", "devops-engineer"],
  kubernetes: ["kubernetes-specialist", "devops-engineer"],
  terraform: ["terraform-engineer"],
  terragrunt: ["terragrunt-expert"],
  aws: ["cloud-architect"],
  gcp: ["cloud-architect"],
  azure: ["azure-infra-engineer", "cloud-architect"],
  "github-actions": ["devops-engineer", "deployment-engineer"],

  // Testing
  playwright: ["test-automator", "qa-expert"],
  cypress: ["test-automator", "qa-expert"],
  jest: ["test-automator"],
  pytest: ["test-automator", "python-pro"],
  vitest: ["test-automator", "typescript-pro"],

  // Data & AI
  openai: ["ai-engineer", "llm-architect"],
  langchain: ["ai-engineer", "llm-architect"],
  anthropic: ["ai-engineer", "llm-architect"],
  pandas: ["data-scientist", "data-analyst"],
  tensorflow: ["machine-learning-engineer"],
  pytorch: ["machine-learning-engineer"],
  mlflow: ["mlops-engineer"],

  // Specialized
  graphql: ["graphql-architect"],
  websocket: ["websocket-engineer"],
  electron: ["electron-pro"],
  "react-native": ["mobile-developer"],
  tailwind: ["frontend-developer", "ui-designer"],
  wordpress: ["wordpress-master"],
  blockchain: ["blockchain-developer"],
};

/** Maps technology keywords to recommended skills */
const TECH_SKILL_MAP: Record<string, SkillMatch[]> = {
  // ── Always recommended (BMAD workflow + general-purpose upstream) ────────
  _always: [
    { name: "bmad-story-pipeline", description: "Story implementation end-to-end" },
    { name: "bmad-epic-pipeline", description: "Full epic delivery pipeline" },
    { name: "pdf", description: "PDF extraction, merging, splitting, form handling" },
    { name: "docx", description: "Word document creation and editing" },
    { name: "xlsx", description: "Excel spreadsheet operations and analysis" },
    { name: "mcp-builder", description: "Create MCP servers for API integration" },
  ],

  // ── Testing ─────────────────────────────────────────────────────────────
  testing: [
    { name: "bmad-tea-testarch-framework", description: "Test framework selection" },
    { name: "bmad-tea-testarch-test-design", description: "Test architecture design" },
    { name: "test-driven-development", description: "TDD with RED-GREEN-REFACTOR cycle" },
    { name: "pypict-testing", description: "Pairwise combinatorial test case design" },
  ],
  playwright: [
    { name: "bmad-tea-testarch-automate", description: "E2E test automation strategy" },
    { name: "webapp-testing", description: "Test web apps using Playwright with screenshots" },
    { name: "playwright-skill", description: "Browser automation with Playwright" },
  ],

  // ── Frontend ────────────────────────────────────────────────────────────
  react: [
    { name: "bmad-bmm-create-ux-design", description: "UX design specification" },
    { name: "web-artifacts-builder", description: "Build HTML artifacts with React + Tailwind" },
    { name: "frontend-design", description: "Production-grade frontend interfaces" },
  ],
  nextjs: [
    { name: "next-best-practices", description: "Next.js App Router and server component patterns" },
    { name: "next-cache-components", description: "Next.js caching and PPR optimization" },
  ],
  tailwind: [
    { name: "frontend-design", description: "Production-grade frontend interfaces" },
  ],
  vue: [
    { name: "frontend-design", description: "Production-grade frontend interfaces" },
  ],
  angular: [
    { name: "frontend-design", description: "Production-grade frontend interfaces" },
  ],

  // ── Mobile ──────────────────────────────────────────────────────────────
  "react-native": [
    { name: "expo-native-ui", description: "Build native UI with Expo Router" },
    { name: "expo-deployment", description: "Deploy Expo apps to App Store and Play Store" },
  ],

  // ── Python ──────────────────────────────────────────────────────────────
  python: [
    { name: "ruff", description: "Fast Python linter and formatter" },
    { name: "uv", description: "Python package and project manager" },
  ],

  // ── Infrastructure ──────────────────────────────────────────────────────
  terraform: [
    { name: "terraform-style-guide", description: "Terraform HCL style conventions" },
    { name: "terraform-test", description: "Writing and running Terraform tests" },
  ],
  aws: [
    { name: "aws-cdk", description: "AWS CDK infrastructure with TypeScript/Python" },
    { name: "aws-serverless", description: "AWS serverless and event-driven architecture" },
  ],
  cloudflare: [
    { name: "wrangler", description: "Cloudflare Workers CLI for deployment and management" },
    { name: "web-perf", description: "Web performance analysis with Core Web Vitals" },
  ],

  // ── Data Visualization ──────────────────────────────────────────────────
  d3: [
    { name: "d3-visualization", description: "Interactive D3.js data visualizations" },
  ],

  // ── AI / ML ─────────────────────────────────────────────────────────────
  openai: [
    { name: "transformers-js", description: "Run ML models in JavaScript with Transformers.js" },
  ],
  pytorch: [
    { name: "transformers-js", description: "Run ML models in JavaScript with Transformers.js" },
  ],
  tensorflow: [
    { name: "transformers-js", description: "Run ML models in JavaScript with Transformers.js" },
  ],

  // ── Security ────────────────────────────────────────────────────────────
  blockchain: [
    { name: "audit-context-building", description: "Line-by-line code analysis for vulnerability context" },
  ],

  // ── Git ─────────────────────────────────────────────────────────────────
  git: [
    { name: "using-git-worktrees", description: "Isolated git worktrees for parallel work" },
  ],
};

// ── Subagent Category Classification ───────────────────────────────────────

const IMPLEMENTATION_CATEGORIES = [
  "01-core-development",
  "02-language-specialists",
  "03-infrastructure",
  "05-data-ai",
  "06-developer-experience",
  "07-specialized-domains",
];

const QUALITY_CATEGORIES = ["04-quality-security"];

const ARCHITECTURE_CATEGORIES = [
  "01-core-development", // api-designer
  "03-infrastructure",   // cloud-architect
  "05-data-ai",          // database-optimizer
  "09-meta-orchestration",
];

// Subagents that belong to architecture even if in implementation categories
const ARCHITECTURE_SUBAGENTS = new Set([
  "api-designer",
  "cloud-architect",
  "microservices-architect",
  "database-optimizer",
  "platform-engineer",
]);

// ── Filesystem Tech Detection ──────────────────────────────────────────────

interface FileDetection {
  file: string;
  detect: (content: string) => Record<string, string[]>;
}

const FILE_DETECTIONS: FileDetection[] = [
  {
    file: "package.json",
    detect: (content) => {
      const pkg = JSON.parse(content);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      const techs: Record<string, string[]> = {};
      const frontend: string[] = [];
      const backend: string[] = [];
      const testing: string[] = [];

      for (const dep of Object.keys(allDeps ?? {})) {
        if (dep === "react" || dep === "react-dom") frontend.push("React");
        if (dep === "vue") frontend.push("Vue");
        if (dep === "@angular/core") frontend.push("Angular");
        if (dep === "next") frontend.push("Next.js");
        if (dep === "svelte") frontend.push("Svelte");
        if (dep === "express") backend.push("Express");
        if (dep === "@nestjs/core") backend.push("NestJS");
        if (dep === "typescript") frontend.push("TypeScript");
        if (dep === "tailwindcss") frontend.push("Tailwind CSS");
        if (dep === "playwright" || dep === "@playwright/test") testing.push("Playwright");
        if (dep === "cypress") testing.push("Cypress");
        if (dep === "jest") testing.push("Jest");
        if (dep === "vitest") testing.push("Vitest");
        if (dep === "@supabase/supabase-js") backend.push("Supabase");
        if (dep === "graphql" || dep === "@apollo/client") backend.push("GraphQL");
        if (dep === "socket.io" || dep === "ws") backend.push("WebSocket");
        if (dep === "electron") frontend.push("Electron");
        if (dep === "react-native") frontend.push("React Native");
        if (dep === "openai") backend.push("OpenAI");
        if (dep === "@anthropic-ai/sdk") backend.push("Anthropic");
        if (dep === "langchain") backend.push("LangChain");
      }

      if (frontend.length) techs.Frontend = [...new Set(frontend)];
      if (backend.length) techs.Backend = [...new Set(backend)];
      if (testing.length) techs.Testing = [...new Set(testing)];
      return techs;
    },
  },
  {
    file: "pyproject.toml",
    detect: (content) => {
      const techs: Record<string, string[]> = {};
      const backend: string[] = ["Python"];
      const testing: string[] = [];

      if (/fastapi/i.test(content)) backend.push("FastAPI");
      if (/django/i.test(content)) backend.push("Django");
      if (/flask/i.test(content)) backend.push("Flask");
      if (/sqlalchemy/i.test(content)) backend.push("SQLAlchemy");
      if (/pydantic/i.test(content)) backend.push("Pydantic");
      if (/celery/i.test(content)) backend.push("Celery");
      if (/pytest/i.test(content)) testing.push("pytest");
      if (/playwright/i.test(content)) testing.push("Playwright");
      if (/openai/i.test(content)) backend.push("OpenAI");
      if (/anthropic/i.test(content)) backend.push("Anthropic");
      if (/langchain/i.test(content)) backend.push("LangChain");
      if (/pandas/i.test(content)) backend.push("Pandas");
      if (/torch|pytorch/i.test(content)) backend.push("PyTorch");
      if (/tensorflow/i.test(content)) backend.push("TensorFlow");
      if (/supabase/i.test(content)) backend.push("Supabase");

      techs.Backend = [...new Set(backend)];
      if (testing.length) techs.Testing = [...new Set(testing)];
      return techs;
    },
  },
  {
    file: "requirements.txt",
    detect: (content) => {
      const techs: Record<string, string[]> = {};
      const backend: string[] = ["Python"];
      const testing: string[] = [];

      if (/fastapi/i.test(content)) backend.push("FastAPI");
      if (/django/i.test(content)) backend.push("Django");
      if (/flask/i.test(content)) backend.push("Flask");
      if (/sqlalchemy/i.test(content)) backend.push("SQLAlchemy");
      if (/pytest/i.test(content)) testing.push("pytest");
      if (/playwright/i.test(content)) testing.push("Playwright");
      if (/supabase/i.test(content)) backend.push("Supabase");

      techs.Backend = [...new Set(backend)];
      if (testing.length) techs.Testing = [...new Set(testing)];
      return techs;
    },
  },
  {
    file: "Cargo.toml",
    detect: () => ({ Backend: ["Rust"] }),
  },
  {
    file: "go.mod",
    detect: () => ({ Backend: ["Go"] }),
  },
  {
    file: "Gemfile",
    detect: (content) => {
      const backend = ["Ruby"];
      if (/rails/i.test(content)) backend.push("Rails");
      return { Backend: backend };
    },
  },
];

/** Directory presence detection */
const DIR_DETECTIONS: Record<string, { layer: string; tech: string }> = {
  supabase: { layer: "Database", tech: "Supabase" },
  ".github/workflows": { layer: "Infra", tech: "GitHub Actions" },
};

/** File presence detection */
const PRESENCE_DETECTIONS: Record<string, { layer: string; tech: string }> = {
  "docker-compose.yml": { layer: "Infra", tech: "Docker" },
  "docker-compose.yaml": { layer: "Infra", tech: "Docker" },
  Dockerfile: { layer: "Infra", tech: "Docker" },
  "playwright.config.ts": { layer: "Testing", tech: "Playwright" },
  "playwright.config.js": { layer: "Testing", tech: "Playwright" },
  "terraform.tf": { layer: "Infra", tech: "Terraform" },
  "terragrunt.hcl": { layer: "Infra", tech: "Terragrunt" },
};

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Scan the project filesystem to detect technologies in use.
 */
export async function scanProjectTechStack(
  projectPath: string
): Promise<TechStack> {
  const layers: Record<string, string[]> = {};

  const addTech = (layer: string, tech: string) => {
    if (!layers[layer]) layers[layer] = [];
    if (!layers[layer].includes(tech)) layers[layer].push(tech);
  };

  // Scan config files
  for (const detection of FILE_DETECTIONS) {
    try {
      const content = await readFile(
        join(projectPath, detection.file),
        "utf-8"
      );
      const detected = detection.detect(content);
      for (const [layer, techs] of Object.entries(detected)) {
        for (const tech of techs) addTech(layer, tech);
      }
    } catch {
      // File doesn't exist — skip
    }
  }

  // Check directory presence
  for (const [dir, { layer, tech }] of Object.entries(DIR_DETECTIONS)) {
    try {
      await access(join(projectPath, dir));
      addTech(layer, tech);
    } catch {
      // Doesn't exist — skip
    }
  }

  // Check file presence
  for (const [file, { layer, tech }] of Object.entries(PRESENCE_DETECTIONS)) {
    try {
      await access(join(projectPath, file));
      addTech(layer, tech);
    } catch {
      // Doesn't exist — skip
    }
  }

  // Build keyword list from all detected techs
  const keywords = Object.values(layers)
    .flat()
    .map((t) => t.toLowerCase().replace(/[.\s]/g, ""));

  return { layers, keywords };
}

/**
 * Parse architecture doc for additional tech stack info.
 */
export async function parseArchitectureDoc(
  archPath: string
): Promise<TechStack> {
  const layers: Record<string, string[]> = {};

  let content: string;
  try {
    content = await readFile(archPath, "utf-8");
  } catch {
    return { layers, keywords: [] };
  }

  // Look for tech stack tables: | Layer | Technologies |
  const tableRegex =
    /\|\s*(?:Layer|Category|Component|Area)\s*\|[^\n]*\n\|[-\s|]+\n((?:\|[^\n]+\n)*)/gi;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const rows = match[1].trim().split("\n");
    for (const row of rows) {
      const cells = row
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 2) {
        const layer = cells[0];
        const techs = cells[1]
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (!layers[layer]) layers[layer] = [];
        for (const tech of techs) {
          if (!layers[layer].includes(tech)) layers[layer].push(tech);
        }
      }
    }
  }

  // Keywords come only from the structured table data already parsed above.
  // Scanning free-text prose for tech keywords produces too many false positives
  // (e.g., "React" mentioned as future evaluation, "Playwright" as fallback).
  const keywords = Object.values(layers)
    .flat()
    .map((t) => t.toLowerCase().replace(/[.\s]/g, ""));

  return { layers, keywords: [...new Set(keywords)] };
}

/**
 * Detect full tech stack combining filesystem scan and architecture doc.
 */
export async function detectTechStack(
  projectPath: string
): Promise<TechStack> {
  const fsScan = await scanProjectTechStack(projectPath);

  // Try to find architecture doc
  const archPaths = [
    join(projectPath, "_bmad-output/planning-artifacts/architecture.md"),
    join(projectPath, "docs/architecture.md"),
  ];

  let archScan: TechStack = { layers: {}, keywords: [] };
  for (const p of archPaths) {
    archScan = await parseArchitectureDoc(p);
    if (archScan.keywords.length > 0) break;
  }

  // Merge: architecture doc layers take priority for naming,
  // filesystem scan adds anything not already covered
  const merged: Record<string, string[]> = { ...archScan.layers };
  for (const [layer, techs] of Object.entries(fsScan.layers)) {
    if (!merged[layer]) merged[layer] = [];
    for (const tech of techs) {
      if (!merged[layer].includes(tech)) merged[layer].push(tech);
    }
  }

  const allKeywords = [
    ...new Set([...archScan.keywords, ...fsScan.keywords]),
  ];

  return { layers: merged, keywords: allKeywords };
}

/**
 * Parse subagent frontmatter from a markdown file.
 */
async function parseSubagentFile(
  filePath: string
): Promise<{ name: string; description: string } | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*"?([^"]+)"?$/m);

    if (!nameMatch) return null;
    return {
      name: nameMatch[1].trim(),
      description: descMatch ? descMatch[1].trim() : "",
    };
  } catch {
    return null;
  }
}

/**
 * Candidate paths where claude-subagents might live, relative to bmadMethodPath.
 * The plugin structure may vary: subagents can be in core/claude-subagents/
 * within the method path, or in a sibling core/ directory.
 */
const SUBAGENT_DIR_CANDIDATES = [
  "core/claude-subagents",
  "../core/claude-subagents",
  "../../core/claude-subagents",
];

/**
 * Load all subagent definitions from the subagents directory.
 * Searches multiple candidate paths to handle different installation layouts.
 */
async function loadSubagentIndex(
  bmadMethodPath: string
): Promise<Map<string, { name: string; description: string; category: string }>> {
  const index = new Map<
    string,
    { name: string; description: string; category: string }
  >();

  // Try each candidate path
  let subagentsDir: string | null = null;
  for (const candidate of SUBAGENT_DIR_CANDIDATES) {
    const candidatePath = join(bmadMethodPath, candidate);
    try {
      await access(candidatePath);
      subagentsDir = candidatePath;
      break;
    } catch {
      continue;
    }
  }

  if (!subagentsDir) return index;

  let categories: string[];
  try {
    categories = await readdir(subagentsDir);
  } catch {
    return index;
  }

  for (const cat of categories) {
    const catDir = join(subagentsDir, cat);
    let files: string[];
    try {
      files = await readdir(catDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".md") || file === "README.md") continue;
      const parsed = await parseSubagentFile(join(catDir, file));
      if (parsed) {
        index.set(parsed.name, {
          ...parsed,
          category: cat,
        });
      }
    }
  }

  return index;
}

/**
 * Match detected tech stack to subagents.
 */
export async function matchSubagents(
  techStack: TechStack,
  bmadMethodPath: string
): Promise<TeamRecommendation["subagents"]> {
  const index = await loadSubagentIndex(bmadMethodPath);
  const matched = new Map<string, SubagentMatch>();

  for (const keyword of techStack.keywords) {
    const subagentNames = TECH_SUBAGENT_MAP[keyword];
    if (!subagentNames) continue;

    for (const name of subagentNames) {
      if (matched.has(name)) continue;
      const entry = index.get(name);
      if (!entry) continue;

      matched.set(name, {
        name,
        category: entry.category,
        description: entry.description,
        reason: keyword,
      });
    }
  }

  // Classify into groups
  const implementation: SubagentMatch[] = [];
  const quality: SubagentMatch[] = [];
  const architecture: SubagentMatch[] = [];

  for (const agent of matched.values()) {
    if (ARCHITECTURE_SUBAGENTS.has(agent.name)) {
      architecture.push(agent);
    } else if (QUALITY_CATEGORIES.some((c) => agent.category.startsWith(c.slice(0, 2)))) {
      quality.push(agent);
    } else {
      implementation.push(agent);
    }
  }

  return { implementation, quality, architecture };
}

/**
 * Match detected tech stack to skills.
 */
export function matchSkills(techStack: TechStack): SkillMatch[] {
  const skills = new Map<string, SkillMatch>();

  // Always-available skills
  for (const skill of TECH_SKILL_MAP._always ?? []) {
    skills.set(skill.name, skill);
  }

  for (const keyword of techStack.keywords) {
    const matched = TECH_SKILL_MAP[keyword];
    if (!matched) continue;
    for (const skill of matched) {
      skills.set(skill.name, skill);
    }
  }

  return [...skills.values()];
}

/**
 * Render the AGENTS.md file content.
 */
export function renderAgentsMd(rec: TeamRecommendation): string {
  const now = new Date().toISOString();
  const sources = Object.keys(rec.techStack.layers).length > 0
    ? Object.keys(rec.techStack.layers).join(", ")
    : "filesystem scan";

  const lines: string[] = [
    `<!-- Generated by bmad_generate_team | ${now} -->`,
    `<!-- Sources: ${sources} -->`,
    "",
    `# Project Team — ${rec.projectName}`,
    "",
    "## Tech Stack",
    "",
    "| Layer | Technologies |",
    "|-------|-------------|",
  ];

  for (const [layer, techs] of Object.entries(rec.techStack.layers)) {
    lines.push(`| ${layer} | ${techs.join(", ")} |`);
  }

  lines.push("", "## Recommended Subagents", "");

  if (rec.subagents.implementation.length > 0) {
    lines.push("### Implementation", "");
    lines.push("| Subagent | Why |");
    lines.push("|----------|-----|");
    for (const a of rec.subagents.implementation) {
      lines.push(`| ${a.name} | ${a.reason} |`);
    }
    lines.push("");
  }

  if (rec.subagents.quality.length > 0) {
    lines.push("### Quality & Review", "");
    lines.push("| Subagent | Why |");
    lines.push("|----------|-----|");
    for (const a of rec.subagents.quality) {
      lines.push(`| ${a.name} | ${a.reason} |`);
    }
    lines.push("");
  }

  if (rec.subagents.architecture.length > 0) {
    lines.push("### Architecture & Planning", "");
    lines.push("| Subagent | Why |");
    lines.push("|----------|-----|");
    for (const a of rec.subagents.architecture) {
      lines.push(`| ${a.name} | ${a.reason} |`);
    }
    lines.push("");
  }

  if (rec.skills.length > 0) {
    const bmadSkills = rec.skills.filter((s) => s.name.startsWith("bmad-"));
    const upstreamSkills = rec.skills.filter((s) => !s.name.startsWith("bmad-"));

    if (bmadSkills.length > 0) {
      lines.push("## BMAD Workflow Skills", "");
      lines.push("| Skill | When to Use |");
      lines.push("|-------|------------|");
      for (const s of bmadSkills) {
        lines.push(`| ${s.name} | ${s.description} |`);
      }
      lines.push("");
    }

    if (upstreamSkills.length > 0) {
      lines.push("## Recommended Skills", "");
      lines.push("| Skill | When to Use |");
      lines.push("|-------|------------|");
      for (const s of upstreamSkills) {
        lines.push(`| ${s.name} | ${s.description} |`);
      }
      lines.push("");
    }
  }

  // Usage notes: generate practical guidance
  lines.push("## Usage Notes", "");
  const implAgents = rec.subagents.implementation;
  const backendAgents = implAgents.filter((a) =>
    ["python-pro", "backend-developer", "golang-pro", "java-architect",
     "django-developer", "laravel-specialist", "rails-expert",
     "spring-boot-engineer", "dotnet-core-expert", "php-pro",
     "rust-engineer", "elixir-expert"].includes(a.name)
  );
  const frontendAgents = implAgents.filter((a) =>
    ["react-specialist", "frontend-developer", "vue-expert",
     "angular-architect", "nextjs-developer", "typescript-pro",
     "flutter-expert", "ui-designer"].includes(a.name)
  );
  const dbAgents = [
    ...implAgents.filter((a) =>
      ["postgres-pro", "database-administrator", "sql-pro"].includes(a.name)
    ),
    ...rec.subagents.architecture.filter((a) =>
      ["database-optimizer"].includes(a.name)
    ),
  ];

  if (backendAgents.length > 0) {
    lines.push(
      `- Backend stories: prefer \`${backendAgents.map((a) => a.name).join("` or `")}\``
    );
  }
  if (frontendAgents.length > 0) {
    lines.push(
      `- Frontend stories: prefer \`${frontendAgents.map((a) => a.name).join("` or `")}\``
    );
  }
  if (dbAgents.length > 0) {
    lines.push(
      `- Database work: use \`${dbAgents.map((a) => a.name).join("` or `")}\``
    );
  }
  if (rec.subagents.quality.length > 0) {
    lines.push(
      `- Code review & testing: use \`${rec.subagents.quality.map((a) => a.name).join("` or `")}\``
    );
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Filter AGENTS.md content for a specific agent role.
 * Returns a compact excerpt relevant to the spawned agent.
 */
export function filterTeamForRole(
  agentsMdContent: string,
  agentId: string,
  phase: string
): string {
  const sections = parseAgentsMdSections(agentsMdContent);

  const parts: string[] = [];

  // Always include tech stack (compact)
  if (sections.techStack) {
    parts.push(sections.techStack);
  }

  // Role-based filtering
  const isDevAgent = ["dev", "quick-flow-solo-dev"].includes(agentId);
  const isQaAgent = ["qa", "tea"].includes(agentId);
  const isArchAgent = ["architect"].includes(agentId);
  const isPlanningAgent = ["analyst", "pm", "ux-designer", "sm"].includes(agentId);

  if (isDevAgent) {
    if (sections.implementation) parts.push(sections.implementation);
    if (sections.quality) parts.push(sections.quality);
  } else if (isQaAgent) {
    if (sections.quality) parts.push(sections.quality);
    if (sections.implementation) parts.push(sections.implementation);
  } else if (isArchAgent) {
    if (sections.architecture) parts.push(sections.architecture);
    if (sections.implementation) parts.push(sections.implementation);
  } else if (isPlanningAgent && phase === "implementation") {
    // SM/PM in implementation phase might need to know the team
    if (sections.implementation) parts.push(sections.implementation);
  }

  // Always include skills and usage notes
  if (sections.skills) parts.push(sections.skills);
  if (sections.bmadSkills) parts.push(sections.bmadSkills);
  if (sections.recommendedSkills) parts.push(sections.recommendedSkills);
  if (sections.usageNotes) parts.push(sections.usageNotes);

  return parts.join("\n\n");
}

/**
 * Parse AGENTS.md into named sections for filtering.
 */
function parseAgentsMdSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};

  // Extract section by heading
  const extract = (heading: string, key: string) => {
    const regex = new RegExp(
      `(##[#]?\\s+${heading}[\\s\\S]*?)(?=\\n##[^#]|\\n#[^#]|$)`,
      "i"
    );
    const match = content.match(regex);
    if (match) sections[key] = match[1].trim();
  };

  extract("Tech Stack", "techStack");
  extract("Implementation", "implementation");
  extract("Quality & Review", "quality");
  extract("Architecture & Planning", "architecture");
  // Support both legacy "Available Skills" and new split sections
  extract("Available Skills", "skills");
  extract("BMAD Workflow Skills", "bmadSkills");
  extract("Recommended Skills", "recommendedSkills");
  extract("Usage Notes", "usageNotes");

  return sections;
}

/**
 * Full pipeline: detect tech, match subagents/skills, generate AGENTS.md.
 */
export async function generateTeamFile(
  projectPath: string,
  bmadMethodPath: string,
  projectName?: string
): Promise<{ content: string; recommendation: TeamRecommendation }> {
  const name =
    projectName ?? basename(projectPath);

  const techStack = await detectTechStack(projectPath);
  const subagents = await matchSubagents(techStack, bmadMethodPath);
  const skills = matchSkills(techStack);

  const recommendation: TeamRecommendation = {
    projectName: name,
    techStack,
    subagents,
    skills,
  };

  const content = renderAgentsMd(recommendation);
  return { content, recommendation };
}
