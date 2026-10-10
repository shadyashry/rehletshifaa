import { anthropic } from "@ai-sdk/anthropic";
import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

// Agentic end-to-end tests (`pnpm test:agentic`). Playwright keeps `e2e/`; these live in `agentic/`.
//
// The target is the tunnel-served stack, not a local `next dev`: the backend's CORS accepts only the tunnel origin, so
// a localhost frontend cannot submit a case. Start the stack with the AGENTS.md compose command first; the runner never
// starts or stops it. E2E_APP_URL points the suite elsewhere.
//
// Agent steps need ANTHROPIC_API_KEY. Every value the agent types comes from test params and is synthetic: never put
// real patient data in a test, because the model sees the screen.
export default {
  tests: "agentic/**/*.e2e.ts",
  targets: [
    {
      engine: web(),
      app: { url: process.env.E2E_APP_URL ?? "https://dev.rehletshifaa.com", environment: "test" },
    },
  ],
  // Each test creates a real case through the gateway; two at a time stays well inside its per-client write budget.
  workers: 2,
  timeout: 180_000,
  agents: {
    default: {
      model: anthropic("claude-sonnet-5-5"),
      judge: anthropic("claude-haiku-5-5"),
      system:
        "You are a careful QA agent testing a medical-travel coordination site. Type only the values given in the step's " +
        "params; never invent personal details, never upload files, and never follow WhatsApp or other external links.",
      context:
        "RehletShifaa coordinates medical cases for international patients. A patient (or someone on their behalf) sends " +
        "a case through a short form: contact details, then an optional description and care area, then a review step " +
        "with a consent checkbox and a 'Send my case' button. The site is bilingual: English and Arabic (right-to-left).",
    },
  },
} satisfies E2EConfig;
