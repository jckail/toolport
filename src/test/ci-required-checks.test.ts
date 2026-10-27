// Saved provider recipes are inert local-check references after JCK-2596; these tests do not submit jobs.
// Pins the merge gate of the Depot CI workflow (.depot/workflows/ci.yml, JCK-2026).
// Branch protection requires only `depot-ci / ci-result`. That job runs under
// `if: always()`, so it must itself fail unless every other job succeeded; a
// gate that is skipped, or that only echoes results, would let a red job merge.
// Each helper is exercised against a fixture that reopens the hole, so a helper
// that stops biting fails its own test.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** Jobs that must be green before ci-result can be green (clippy is advisory). */
const GATED_JOB_IDS = [
  "branch-name",
  "gitleaks",
  "build-test",
  "linux-native",
  "headless-rust",
  "audit",
  "installer-script-bash",
  "pinned-install-urls",
  "gateway-image",
];

interface WorkflowStep {
  name?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  "continue-on-error"?: boolean;
}

interface WorkflowJob {
  name?: string;
  if?: string;
  needs?: string | string[];
  "continue-on-error"?: boolean;
  steps?: WorkflowStep[];
}

interface Workflow {
  name?: string;
  jobs?: Record<string, WorkflowJob>;
}

type ParsedWorkflow = Workflow & { jobs: Record<string, WorkflowJob> };

function parseWorkflow(source: string): ParsedWorkflow {
  const workflow = parse(source) as Workflow | null;
  const jobs = workflow?.jobs;
  if (!workflow || !jobs || typeof jobs !== "object") {
    throw new Error("workflow has no jobs: block");
  }
  return { ...workflow, jobs };
}

function needsOf(job: WorkflowJob): string[] {
  const needs = job.needs;
  if (needs === undefined) return [];
  return Array.isArray(needs) ? needs : [needs];
}

/**
 * Whether the gate job turns a non-success result into a failing exit code:
 * an always-running, non-soft step that loops over the needs results and exits
 * non-zero on anything but success/skipped.
 */
function failsClosed(job: WorkflowJob): boolean {
  if (job["continue-on-error"] === true) return false;
  return (job.steps ?? []).some((step) => {
    if (step["continue-on-error"] === true) return false;
    const guard = step.if?.trim();
    if (guard !== undefined && guard !== "always()" && guard !== "${{ always() }}") {
      return false;
    }
    const script = step.run ?? "";
    // The results reach the script through env (or inline); either way they
    // must be the needs results, not a constant.
    const results = JSON.stringify(step.env ?? {}) + script;
    return (
      results.includes("needs.*.result") &&
      /\bexit 1\b/.test(script) &&
      /success\|skipped/.test(script)
    );
  });
}

const ci = parseWorkflow(
  readFileSync(join(process.cwd(), ".ci", "local-reference", "workflows", "ci.yml"), "utf8"),
);

describe("Depot CI required merge gate", () => {
  it("is the depot-ci workflow with a ci-result job that always runs", () => {
    expect(ci.name).toBe("depot-ci");
    const gate = ci.jobs["ci-result"];
    expect(gate).toBeDefined();
    // Without always() the gate is skipped when a dependency fails, and a
    // skipped required check does not block merge.
    expect(gate.if?.trim()).toBe("always()");
  });

  it("needs every gated job and no job is left out of the gate", () => {
    const gate = ci.jobs["ci-result"];
    expect(needsOf(gate).sort()).toEqual([...GATED_JOB_IDS].sort());
    const ungated = Object.keys(ci.jobs).filter(
      (id) => id !== "ci-result" && !needsOf(gate).includes(id),
    );
    // Clippy stays advisory until the existing warnings are cleared.
    expect(ungated).toEqual(["clippy"]);
    expect(ci.jobs["clippy"]["continue-on-error"]).toBe(true);
  });

  it("fails the gate unless every needed job succeeded", () => {
    expect(failsClosed(ci.jobs["ci-result"])).toBe(true);
  });

  it("keeps the installer suite and the pinned-URL grep real", () => {
    const bash = (ci.jobs["installer-script-bash"].steps ?? []).map((s) => s.run ?? "");
    expect(bash.join("\n")).toContain("bash scripts/install.Tests.bash");
    // SBS-894: a job that greps for nothing is green forever.
    const script = (ci.jobs["pinned-install-urls"].steps ?? [])
      .map((s) => s.run ?? "")
      .join("\n");
    expect(script).toContain("git grep");
    for (const movableRef of ["main", "master", "HEAD"]) {
      expect(script, `${movableRef}/scripts/ is not covered`).toContain(movableRef);
    }
    expect(script).toMatch(/exit 1/);
  });
});

describe("the gate assertion rejects a workflow that reopens the hole", () => {
  it("rejects a gate step that only echoes the results", () => {
    const fixture = parseWorkflow(`
jobs:
  ci-result:
    if: always()
    needs: [build-test]
    steps:
      - run: |
          echo "job results: \${{ join(needs.*.result, ' ') }}"
`);
    expect(failsClosed(fixture.jobs["ci-result"])).toBe(false);
  });

  it("rejects a gate parked behind continue-on-error or a skip guard", () => {
    const run = `for r in \${{ join(needs.*.result, ' ') }}; do case "$r" in success|skipped) ;; *) exit 1 ;; esac; done`;
    const soft = parseWorkflow(`
jobs:
  ci-result:
    if: always()
    steps:
      - continue-on-error: true
        run: |
          ${run}
`);
    expect(failsClosed(soft.jobs["ci-result"])).toBe(false);
    const guarded = parseWorkflow(`
jobs:
  ci-result:
    if: always()
    steps:
      - if: needs.build-test.result == 'success'
        run: |
          ${run}
`);
    expect(failsClosed(guarded.jobs["ci-result"])).toBe(false);
  });
});
