import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  scanProjectTechStack,
  parseArchitectureDoc,
  detectTechStack,
  matchSubagents,
  matchSkills,
  renderAgentsMd,
  filterTeamForRole,
  generateTeamFile,
} from "../lib/team-resolver.ts";

const BMAD_METHOD = join(import.meta.dirname, "../../bmad-method");

// ── scanProjectTechStack ───────────────────────────────────────────────────

describe("scanProjectTechStack", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "team-scan-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("detects Python/FastAPI from requirements.txt", async () => {
    await writeFile(
      join(tempDir, "requirements.txt"),
      "fastapi\nuvicorn\nsqlalchemy\npytest\nsupabase\n"
    );

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Backend).toContain("Python");
    expect(result.layers.Backend).toContain("FastAPI");
    expect(result.layers.Backend).toContain("SQLAlchemy");
    expect(result.layers.Backend).toContain("Supabase");
    expect(result.layers.Testing).toContain("pytest");
    expect(result.keywords).toContain("python");
    expect(result.keywords).toContain("fastapi");
  });

  it("detects React/TypeScript from package.json", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
        devDependencies: { typescript: "^5.0.0", vitest: "^3.0.0" },
      })
    );

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Frontend).toContain("React");
    expect(result.layers.Frontend).toContain("TypeScript");
    expect(result.layers.Testing).toContain("Vitest");
  });

  it("detects Docker from Dockerfile presence", async () => {
    await writeFile(join(tempDir, "Dockerfile"), "FROM node:20\n");

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Infra).toContain("Docker");
  });

  it("detects Supabase from directory presence", async () => {
    await mkdir(join(tempDir, "supabase"));

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Database).toContain("Supabase");
  });

  it("detects GitHub Actions from .github/workflows", async () => {
    await mkdir(join(tempDir, ".github/workflows"), { recursive: true });

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Infra).toContain("GitHub Actions");
  });

  it("detects Playwright from config file", async () => {
    await writeFile(join(tempDir, "playwright.config.ts"), "export default {}");

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Testing).toContain("Playwright");
  });

  it("returns empty for project with no recognizable files", async () => {
    const result = await scanProjectTechStack(tempDir);

    expect(Object.keys(result.layers)).toHaveLength(0);
    expect(result.keywords).toHaveLength(0);
  });

  it("detects pyproject.toml with Django", async () => {
    await writeFile(
      join(tempDir, "pyproject.toml"),
      '[project]\nname = "myapp"\ndependencies = ["django>=4.2", "celery"]'
    );

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Backend).toContain("Python");
    expect(result.layers.Backend).toContain("Django");
    expect(result.layers.Backend).toContain("Celery");
  });

  it("detects Go from go.mod", async () => {
    await writeFile(join(tempDir, "go.mod"), "module example.com/myapp\n\ngo 1.22\n");

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Backend).toContain("Go");
  });

  it("detects Rust from Cargo.toml", async () => {
    await writeFile(join(tempDir, "Cargo.toml"), '[package]\nname = "myapp"\n');

    const result = await scanProjectTechStack(tempDir);

    expect(result.layers.Backend).toContain("Rust");
  });
});

// ── parseArchitectureDoc ───────────────────────────────────────────────────

describe("parseArchitectureDoc", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "team-arch-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses tech stack table from architecture doc", async () => {
    const archDoc = `
# Architecture

## Selected Stack

| Layer | Tool |
|---|---|
| Language | Python 3.12 |
| Framework | FastAPI |
| Database | PostgreSQL |
| Frontend | Streamlit |
`;
    const archPath = join(tempDir, "architecture.md");
    await writeFile(archPath, archDoc);

    const result = await parseArchitectureDoc(archPath);

    expect(result.layers.Language).toContain("Python 3.12");
    expect(result.layers.Framework).toContain("FastAPI");
    expect(result.layers.Database).toContain("PostgreSQL");
  });

  it("does not pick up tech keywords from general prose", async () => {
    const archDoc = `
# Architecture

We considered using React but chose Streamlit instead.
The team evaluated Go and Rust but Python was the better fit.
JavaScript was ruled out early.

## Selected Stack

| Layer | Tool |
|---|---|
| Language | Python |
| Dashboard | Streamlit |
`;
    const archPath = join(tempDir, "architecture.md");
    await writeFile(archPath, archDoc);

    const result = await parseArchitectureDoc(archPath);

    // Should only have keywords from the table, not from prose
    expect(result.keywords).toContain("python");
    expect(result.keywords).toContain("streamlit");
    expect(result.keywords).not.toContain("react");
    expect(result.keywords).not.toContain("go");
    expect(result.keywords).not.toContain("rust");
    expect(result.keywords).not.toContain("javascript");
  });

  it("returns empty for non-existent file", async () => {
    const result = await parseArchitectureDoc(join(tempDir, "nope.md"));

    expect(Object.keys(result.layers)).toHaveLength(0);
    expect(result.keywords).toHaveLength(0);
  });

  it("handles multi-value cells with commas", async () => {
    const archDoc = `
| Category | Technologies |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy |
| Testing | pytest, Playwright |
`;
    const archPath = join(tempDir, "arch.md");
    await writeFile(archPath, archDoc);

    const result = await parseArchitectureDoc(archPath);

    expect(result.layers.Backend).toEqual(["Python", "FastAPI", "SQLAlchemy"]);
    expect(result.layers.Testing).toEqual(["pytest", "Playwright"]);
  });
});

// ── detectTechStack (integration) ──────────────────────────────────────────

describe("detectTechStack", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "team-detect-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("merges filesystem scan and architecture doc", async () => {
    // Filesystem: Python + FastAPI
    await writeFile(
      join(tempDir, "requirements.txt"),
      "fastapi\nuvicorn\n"
    );
    // Arch doc: adds Docker layer
    await mkdir(join(tempDir, "_bmad-output/planning-artifacts"), {
      recursive: true,
    });
    await writeFile(
      join(tempDir, "_bmad-output/planning-artifacts/architecture.md"),
      `| Layer | Tool |\n|---|---|\n| Container | Docker Compose |\n`
    );

    const result = await detectTechStack(tempDir);

    // From filesystem
    expect(result.layers.Backend).toContain("Python");
    expect(result.layers.Backend).toContain("FastAPI");
    // From architecture doc
    expect(result.layers.Container).toContain("Docker Compose");
  });

  it("works with only filesystem (no architecture doc)", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: { next: "^14.0.0", react: "^18.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      })
    );

    const result = await detectTechStack(tempDir);

    expect(result.layers.Frontend).toContain("Next.js");
    expect(result.layers.Frontend).toContain("React");
    expect(result.layers.Frontend).toContain("TypeScript");
  });
});

// ── matchSubagents ─────────────────────────────────────────────────────────

describe("matchSubagents", () => {
  it("maps Python/FastAPI stack to correct subagents", async () => {
    const techStack = {
      layers: { Backend: ["Python", "FastAPI"] },
      keywords: ["python", "fastapi"],
    };

    const result = await matchSubagents(techStack, BMAD_METHOD);

    const implNames = result.implementation.map((a) => a.name);
    const archNames = result.architecture.map((a) => a.name);

    expect(implNames).toContain("python-pro");
    expect(implNames).toContain("backend-developer");
    expect(archNames).toContain("api-designer");
  });

  it("maps React/TypeScript stack to frontend subagents", async () => {
    const techStack = {
      layers: { Frontend: ["React", "TypeScript"] },
      keywords: ["react", "typescript"],
    };

    const result = await matchSubagents(techStack, BMAD_METHOD);

    const implNames = result.implementation.map((a) => a.name);

    expect(implNames).toContain("react-specialist");
    expect(implNames).toContain("frontend-developer");
    expect(implNames).toContain("typescript-pro");
  });

  it("maps Docker to infrastructure subagents", async () => {
    const techStack = {
      layers: { Infra: ["Docker"] },
      keywords: ["docker"],
    };

    const result = await matchSubagents(techStack, BMAD_METHOD);

    const implNames = result.implementation.map((a) => a.name);

    expect(implNames).toContain("docker-expert");
    expect(implNames).toContain("devops-engineer");
  });

  it("maps Playwright to quality subagents", async () => {
    const techStack = {
      layers: { Testing: ["Playwright"] },
      keywords: ["playwright"],
    };

    const result = await matchSubagents(techStack, BMAD_METHOD);

    const qualityNames = result.quality.map((a) => a.name);

    expect(qualityNames).toContain("test-automator");
  });

  it("returns empty for unknown tech stack", async () => {
    const techStack = {
      layers: { Other: ["UnknownTech"] },
      keywords: ["unknowntech"],
    };

    const result = await matchSubagents(techStack, BMAD_METHOD);

    expect(result.implementation).toHaveLength(0);
    expect(result.quality).toHaveLength(0);
    expect(result.architecture).toHaveLength(0);
  });

  it("maps Supabase to database subagents", async () => {
    const techStack = {
      layers: { Database: ["Supabase"] },
      keywords: ["supabase"],
    };

    const result = await matchSubagents(techStack, BMAD_METHOD);

    const allNames = [
      ...result.implementation.map((a) => a.name),
      ...result.architecture.map((a) => a.name),
    ];

    expect(allNames).toContain("postgres-pro");
    expect(allNames).toContain("database-administrator");
  });
});

// ── matchSkills ────────────────────────────────────────────────────────────

describe("matchSkills", () => {
  it("always includes story and epic pipeline skills", () => {
    const techStack = { layers: {}, keywords: [] };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("bmad-story-pipeline");
    expect(names).toContain("bmad-epic-pipeline");
  });

  it("always includes upstream utility skills (pdf, docx, xlsx, mcp-builder)", () => {
    const techStack = { layers: {}, keywords: [] };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("pdf");
    expect(names).toContain("docx");
    expect(names).toContain("xlsx");
    expect(names).toContain("mcp-builder");
  });

  it("includes testing skills for testing keywords", () => {
    const techStack = {
      layers: { Testing: ["pytest"] },
      keywords: ["testing"],
    };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("bmad-tea-testarch-framework");
    expect(names).toContain("test-driven-development");
  });

  it("includes upstream react skills for react keyword", () => {
    const techStack = {
      layers: { Frontend: ["React"] },
      keywords: ["react"],
    };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("web-artifacts-builder");
    expect(names).toContain("frontend-design");
    expect(names).toContain("bmad-bmm-create-ux-design");
  });

  it("includes Next.js skills for nextjs keyword", () => {
    const techStack = {
      layers: { Frontend: ["Next.js"] },
      keywords: ["nextjs"],
    };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("next-best-practices");
    expect(names).toContain("next-cache-components");
  });

  it("includes Python tooling skills for python keyword", () => {
    const techStack = {
      layers: { Language: ["Python"] },
      keywords: ["python"],
    };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("ruff");
    expect(names).toContain("uv");
  });

  it("includes terraform skills for terraform keyword", () => {
    const techStack = {
      layers: { Infra: ["Terraform"] },
      keywords: ["terraform"],
    };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("terraform-style-guide");
    expect(names).toContain("terraform-test");
  });

  it("includes AWS skills for aws keyword", () => {
    const techStack = {
      layers: { Infra: ["AWS"] },
      keywords: ["aws"],
    };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("aws-cdk");
    expect(names).toContain("aws-serverless");
  });

  it("deduplicates skills across multiple keywords", () => {
    const techStack = {
      layers: { Frontend: ["React", "Tailwind"] },
      keywords: ["react", "tailwind"],
    };

    const result = matchSkills(techStack);

    // frontend-design is mapped to both react and tailwind
    const frontendDesignCount = result.filter(
      (s) => s.name === "frontend-design"
    ).length;
    expect(frontendDesignCount).toBe(1);
  });

  it("includes playwright upstream skills alongside BMAD skills", () => {
    const techStack = {
      layers: { Testing: ["Playwright"] },
      keywords: ["playwright"],
    };

    const result = matchSkills(techStack);

    const names = result.map((s) => s.name);
    expect(names).toContain("bmad-tea-testarch-automate");
    expect(names).toContain("webapp-testing");
    expect(names).toContain("playwright-skill");
  });
});

// ── renderAgentsMd ─────────────────────────────────────────────────────────

describe("renderAgentsMd", () => {
  it("renders valid markdown with all sections", () => {
    const md = renderAgentsMd({
      projectName: "TestProject",
      techStack: {
        layers: { Backend: ["Python", "FastAPI"], Frontend: ["React"] },
        keywords: ["python", "fastapi", "react"],
      },
      subagents: {
        implementation: [
          { name: "python-pro", category: "02", description: "", reason: "python" },
          { name: "react-specialist", category: "02", description: "", reason: "react" },
        ],
        quality: [
          { name: "test-automator", category: "04", description: "", reason: "pytest" },
        ],
        architecture: [
          { name: "api-designer", category: "01", description: "", reason: "fastapi" },
        ],
      },
      skills: [
        { name: "bmad-story-pipeline", description: "Story delivery" },
      ],
    });

    expect(md).toContain("# Project Team — TestProject");
    expect(md).toContain("## Tech Stack");
    expect(md).toContain("| Backend | Python, FastAPI |");
    expect(md).toContain("### Implementation");
    expect(md).toContain("| python-pro | python |");
    expect(md).toContain("### Quality & Review");
    expect(md).toContain("| test-automator | pytest |");
    expect(md).toContain("### Architecture & Planning");
    expect(md).toContain("| api-designer | fastapi |");
    expect(md).toContain("## BMAD Workflow Skills");
    expect(md).toContain("| bmad-story-pipeline | Story delivery |");
    expect(md).toContain("## Usage Notes");
    expect(md).toContain("Generated by bmad_generate_team");
  });

  it("renders split sections for BMAD and upstream skills", () => {
    const md = renderAgentsMd({
      projectName: "TestProject",
      techStack: {
        layers: { Frontend: ["React"] },
        keywords: ["react"],
      },
      subagents: { implementation: [], quality: [], architecture: [] },
      skills: [
        { name: "bmad-story-pipeline", description: "Story delivery" },
        { name: "bmad-epic-pipeline", description: "Epic delivery" },
        { name: "web-artifacts-builder", description: "Build HTML artifacts" },
        { name: "frontend-design", description: "Production-grade frontend" },
      ],
    });

    expect(md).toContain("## BMAD Workflow Skills");
    expect(md).toContain("| bmad-story-pipeline | Story delivery |");
    expect(md).toContain("| bmad-epic-pipeline | Epic delivery |");
    expect(md).toContain("## Recommended Skills");
    expect(md).toContain("| web-artifacts-builder | Build HTML artifacts |");
    expect(md).toContain("| frontend-design | Production-grade frontend |");
  });

  it("omits Recommended Skills section when only BMAD skills present", () => {
    const md = renderAgentsMd({
      projectName: "TestProject",
      techStack: { layers: {}, keywords: [] },
      subagents: { implementation: [], quality: [], architecture: [] },
      skills: [
        { name: "bmad-story-pipeline", description: "Story delivery" },
      ],
    });

    expect(md).toContain("## BMAD Workflow Skills");
    expect(md).not.toContain("## Recommended Skills");
  });
});

// ── filterTeamForRole ──────────────────────────────────────────────────────

describe("filterTeamForRole", () => {
  const sampleAgentsMd = `
# Project Team — Test

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Python, FastAPI |

## Recommended Subagents

### Implementation

| Subagent | Why |
|----------|-----|
| python-pro | python |

### Quality & Review

| Subagent | Why |
|----------|-----|
| test-automator | pytest |

### Architecture & Planning

| Subagent | Why |
|----------|-----|
| api-designer | fastapi |

## BMAD Workflow Skills

| Skill | When to Use |
|-------|------------|
| bmad-story-pipeline | Story delivery |

## Recommended Skills

| Skill | When to Use |
|-------|------------|
| ruff | Fast Python linter |

## Usage Notes

- Backend: use python-pro
`;

  it("includes implementation + quality for dev agent", () => {
    const filtered = filterTeamForRole(sampleAgentsMd, "dev", "implementation");

    expect(filtered).toContain("Tech Stack");
    expect(filtered).toContain("Implementation");
    expect(filtered).toContain("python-pro");
    expect(filtered).toContain("Quality & Review");
    expect(filtered).toContain("test-automator");
    expect(filtered).toContain("BMAD Workflow Skills");
    expect(filtered).toContain("Recommended Skills");
    expect(filtered).toContain("Usage Notes");
  });

  it("includes quality for qa agent", () => {
    const filtered = filterTeamForRole(sampleAgentsMd, "qa", "implementation");

    expect(filtered).toContain("Quality & Review");
    expect(filtered).toContain("test-automator");
    expect(filtered).toContain("Implementation");
  });

  it("includes architecture for architect agent", () => {
    const filtered = filterTeamForRole(sampleAgentsMd, "architect", "solutioning");

    expect(filtered).toContain("Architecture & Planning");
    expect(filtered).toContain("api-designer");
    expect(filtered).toContain("Implementation");
  });

  it("includes implementation for sm in implementation phase", () => {
    const filtered = filterTeamForRole(sampleAgentsMd, "sm", "implementation");

    expect(filtered).toContain("Implementation");
    expect(filtered).toContain("python-pro");
  });

  it("does not include implementation for analyst in analysis phase", () => {
    const filtered = filterTeamForRole(sampleAgentsMd, "analyst", "analysis");

    expect(filtered).toContain("Tech Stack");
    expect(filtered).toContain("BMAD Workflow Skills");
    expect(filtered).toContain("Recommended Skills");
    expect(filtered).not.toContain("### Implementation");
  });
});

// ── generateTeamFile (full pipeline) ───────────────────────────────────────

describe("generateTeamFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "team-gen-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates complete AGENTS.md for Python/FastAPI project", async () => {
    await writeFile(
      join(tempDir, "requirements.txt"),
      "fastapi\nuvicorn\nsqlalchemy\npytest\nsupabase\n"
    );
    await writeFile(join(tempDir, "Dockerfile"), "FROM python:3.12\n");

    const { content, recommendation } = await generateTeamFile(
      tempDir,
      BMAD_METHOD,
      "TestProject"
    );

    // Content checks
    expect(content).toContain("# Project Team — TestProject");
    expect(content).toContain("Python");
    expect(content).toContain("FastAPI");
    expect(content).toContain("python-pro");
    expect(content).toContain("backend-developer");

    // Recommendation structure checks
    expect(recommendation.techStack.keywords).toContain("python");
    expect(recommendation.techStack.keywords).toContain("fastapi");
    expect(recommendation.subagents.implementation.length).toBeGreaterThan(0);
    expect(recommendation.skills.length).toBeGreaterThan(0);
  });

  it("generates AGENTS.md for React/Next.js project", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: {
          next: "^14.0.0",
          react: "^18.0.0",
          "react-dom": "^18.0.0",
          "@supabase/supabase-js": "^2.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
          "@playwright/test": "^1.40.0",
        },
      })
    );

    const { content, recommendation } = await generateTeamFile(
      tempDir,
      BMAD_METHOD,
      "FrontendApp"
    );

    expect(content).toContain("React");
    expect(content).toContain("Next.js");
    expect(content).toContain("TypeScript");
    expect(content).toContain("react-specialist");
    expect(content).toContain("nextjs-developer");

    const implNames = recommendation.subagents.implementation.map((a) => a.name);
    expect(implNames).toContain("react-specialist");
    expect(implNames).toContain("nextjs-developer");

    const qualityNames = recommendation.subagents.quality.map((a) => a.name);
    expect(qualityNames).toContain("test-automator");
  });

  it("returns minimal output for empty project", async () => {
    const { content, recommendation } = await generateTeamFile(
      tempDir,
      BMAD_METHOD,
      "EmptyProject"
    );

    expect(content).toContain("# Project Team — EmptyProject");
    expect(recommendation.techStack.keywords).toHaveLength(0);
    expect(recommendation.subagents.implementation).toHaveLength(0);
  });
});

// ── Real project: SmartAutomacao ───────────────────────────────────────────

describe("real project: SmartAutomacao", () => {
  const projectPath = "/Users/iangallina/Projetos/SmartAutomacao";

  it("detects correct tech stack", async () => {
    const result = await detectTechStack(projectPath);

    // From requirements.txt
    expect(result.layers.Backend).toContain("Python");
    expect(result.layers.Backend).toContain("FastAPI");
    expect(result.layers.Backend).toContain("Supabase");
    expect(result.layers.Backend).toContain("SQLAlchemy");

    // From architecture doc
    expect(result.layers.Language).toContain("Python");

    // From docker-compose.yml
    expect(result.layers.Infra).toContain("Docker");

    // Should NOT include techs mentioned only in prose
    expect(result.keywords).not.toContain("react");
    expect(result.keywords).not.toContain("javascript");
    expect(result.keywords).not.toContain("rust");
    expect(result.keywords).not.toContain("go");
  });

  it("recommends appropriate subagents", async () => {
    const techStack = await detectTechStack(projectPath);
    const result = await matchSubagents(techStack, BMAD_METHOD);

    const implNames = result.implementation.map((a) => a.name);

    expect(implNames).toContain("python-pro");
    expect(implNames).toContain("backend-developer");
    expect(implNames).toContain("docker-expert");

    // Should NOT recommend frontend-specific agents
    expect(implNames).not.toContain("react-specialist");
    expect(implNames).not.toContain("typescript-pro");
    expect(implNames).not.toContain("angular-architect");
  });

  it("generates full AGENTS.md", async () => {
    const { content } = await generateTeamFile(
      projectPath,
      BMAD_METHOD,
      "SmartAutomacao"
    );

    expect(content).toContain("# Project Team — SmartAutomacao");
    expect(content).toContain("python-pro");
    expect(content).toContain("backend-developer");
    expect(content).toContain("api-designer");
    expect(content).toContain("bmad-story-pipeline");

    // Should not recommend irrelevant agents
    expect(content).not.toContain("react-specialist");
    expect(content).not.toContain("angular-architect");
    expect(content).not.toContain("rust-engineer");
  });
});
