import { describe, it, expect, beforeEach } from "vitest";
import {
  classify,
  routeToModel,
  setConfig,
  estimateTokens,
  MODELS,
  DEFAULT_CONFIG,
  __testing,
} from "./router.js";
import type { RoutingDecision, RouterConfig } from "./router.js";

function resetRouter(overrides: Partial<RouterConfig> = {}): void {
  __testing.clearCache();
  setConfig({ ...DEFAULT_CONFIG, logRouting: false, ...overrides });
}

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates based on word count × 1.3", () => {
    // 10 words × 1.3 = 13
    expect(estimateTokens("one two three four five six seven eight nine ten")).toBe(13);
  });

  it("handles code-heavy text (more tokens per word)", () => {
    const code = "const x = arr.map((item) => item.value).filter(Boolean);";
    // Word-based estimate avoids overcounting for code
    const tokens = estimateTokens(code);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });
});

describe("classify — rule priority order", () => {
  beforeEach(() => resetRouter());

  // ── Rule 0: Manual override ──

  it("routes /builder prefix to Builder", () => {
    const d = classify("/builder write a sorting function in TypeScript");
    expect(d.role).toBe("builder");
    expect(d.reason).toBe("manual:/builder");
  });

  it("routes /vision prefix to Gemini", () => {
    const d = classify("/vision analyze this clip");
    expect(d.role).toBe("vision");
    expect(d.reason).toBe("manual:/vision");
  });

  it("routes /operator prefix to MiMo", () => {
    const d = classify("/operator do a multi-step deployment");
    expect(d.role).toBe("operator");
    expect(d.reason).toBe("manual:/operator");
  });

  it("routes /scout prefix to Kimi", () => {
    const d = classify("/scout search for latest AI news");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("manual:/scout");
  });

  it("routes /thinker prefix to DeepSeek", () => {
    const d = classify("/thinker analyze these trade-offs");
    expect(d.role).toBe("thinker");
    expect(d.reason).toBe("manual:/thinker");
  });

  // ── Rule 1: Video → Gemini (hard constraint) ──

  it("routes video content to Gemini", () => {
    const d = classify("watch this video and summarize the key points");
    expect(d.role).toBe("vision");
    expect(d.reason).toBe("video-content");
  });

  it("routes mp4 reference to Gemini", () => {
    const d = classify("process the meeting recording.mp4 file");
    expect(d.role).toBe("vision");
    expect(d.reason).toBe("video-content");
  });

  // ── Rule 2: Image → Kimi K2.5 (multimodal) ──

  it("routes screenshot to Scout", () => {
    const d = classify("look at this screenshot and tell me what's wrong");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("image-content");
  });

  it("routes base64 image to Scout", () => {
    const d = classify("here's the image data:image/png;base64,abc123");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("image-content");
  });

  // ── Rule 3: Long context → MiMo (hard constraint) ──

  it("routes long prompts to Operator", () => {
    // Generate a prompt with >50K estimated tokens (>38.5K words)
    const words = Array.from({ length: 40_000 }, (_, i) => `word${i}`);
    const d = classify(words.join(" "));
    expect(d.role).toBe("operator");
    expect(d.reason).toBe("long-context");
  });

  // ── Rule 4: Web research → Kimi K2.5 ──

  it("routes 'search for' to Scout", () => {
    const d = classify("search for the latest Flutter release notes and changelog");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("web-research");
  });

  it("routes URL-containing prompts to Scout", () => {
    const d = classify("check https://example.com/api/status and report back");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("web-research");
  });

  // ── Rule 5: Heavy code gen → MiniMax M2.7 ──

  it("routes 'write function + file ext' to Builder", () => {
    const d = classify("write a new function to handle auth tokens in auth_service.ts");
    expect(d.role).toBe("builder");
    expect(d.reason).toBe("heavy-code-gen");
  });

  it("routes 'implement class + code fence' to Builder", () => {
    const d = classify(
      "implement this interface:\n```typescript\ninterface Foo { bar(): void; }\n```",
    );
    expect(d.role).toBe("builder");
    expect(d.reason).toBe("heavy-code-gen");
  });

  it("routes standalone code-gen keyword (long enough) to Builder", () => {
    const d = classify(
      "create a new React component that displays a user profile card with avatar, name, bio, and social links",
    );
    expect(d.role).toBe("builder");
    expect(d.reason).toBe("code-gen");
  });

  it("does NOT route 'explain this error' to Builder (stays MiMo)", () => {
    const d = classify("explain why this stack trace is happening in the auth module");
    // Should fall through to deep-reasoning or default, NOT builder
    expect(d.role).not.toBe("builder");
  });

  it("does NOT route short debug question to Builder", () => {
    const d = classify("why is this null?");
    expect(d.role).not.toBe("builder");
  });

  // ── Rule 6: Deep reasoning → DeepSeek V3.2 ──

  it("routes analysis tasks to Thinker", () => {
    const d = classify(
      "analyze the trade-offs between using WebSockets vs Server-Sent Events for our real-time update system",
    );
    expect(d.role).toBe("thinker");
    expect(d.reason).toBe("deep-reasoning");
  });

  it("routes 'compare and evaluate' to Thinker", () => {
    const d = classify(
      "compare Redis vs Memcached for our caching layer and evaluate the pros and cons of each approach",
    );
    expect(d.role).toBe("thinker");
    expect(d.reason).toBe("deep-reasoning");
  });

  it("does NOT route short reasoning to Thinker (too few tokens)", () => {
    // Very short prompts with reasoning words should not trigger deep-reasoning
    const d = classify("analyze this");
    expect(d.role).not.toBe("thinker"); // Too short (<100 tokens)
  });

  // ── Rule 7: Data processing → Step 3.5 Flash (worker) ──

  it("routes /worker prefix to Worker", () => {
    const d = classify("/worker process all the CSV files");
    expect(d.role).toBe("worker");
    expect(d.reason).toBe("manual:/worker");
  });

  it("routes data processing tasks to Worker", () => {
    const d = classify("parse and normalize all the user records from the JSON dump");
    expect(d.role).toBe("worker");
    expect(d.reason).toBe("data-processing");
  });

  it("routes batch/bulk operations to Worker", () => {
    const d = classify("batch deduplicate and clean the email list");
    expect(d.role).toBe("worker");
    expect(d.reason).toBe("data-processing");
  });

  it("routes CSV/JSON transformation to Worker", () => {
    const d = classify("convert all CSV files to JSON and merge them together");
    expect(d.role).toBe("worker");
    expect(d.reason).toBe("data-processing");
  });

  it("routes ETL pipeline tasks to Worker", () => {
    const d = classify("run the ETL pipeline to ingest the new dataset");
    expect(d.role).toBe("worker");
    expect(d.reason).toBe("data-processing");
  });

  // ── Rule 8: Speed chat → Kimi K2.5 ──

  it("routes short conversational prompt to Scout", () => {
    const d = classify("hey what's up?");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("speed-chat");
  });

  it("routes 'thanks' to Scout", () => {
    const d = classify("thanks!");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("speed-chat");
  });

  // ── Rule 9: Default → MiMo ──

  it("routes generic prompts to Operator (default)", () => {
    const d = classify("tell me about the matchmaking algorithm we use");
    expect(d.role).toBe("operator");
    expect(d.reason).toBe("default");
  });

  it("routes ambiguous debug/refactor to Operator (default)", () => {
    const d = classify("this endpoint is slow, can you take a look?");
    expect(d.role).toBe("operator");
    expect(d.reason).toBe("default");
  });
});

describe("classify — rule priority wins correctly", () => {
  beforeEach(() => resetRouter());

  it("video beats code-gen (hard constraint > preference)", () => {
    const d = classify("write a function to process this video recording");
    expect(d.role).toBe("vision"); // video wins over code-gen
  });

  it("image beats web-research", () => {
    const d = classify("look at this screenshot from https://example.com");
    expect(d.role).toBe("scout");
    expect(d.reason).toBe("image-content"); // image rule fires first
  });

  it("manual override beats everything", () => {
    const d = classify("/thinker watch this video and write code for it");
    expect(d.role).toBe("thinker");
    expect(d.reason).toBe("manual:/thinker");
  });
});

describe("sticky routing", () => {
  beforeEach(() => resetRouter());

  it("reuses first decision for same sessionId", () => {
    const r1 = routeToModel("write a function in utils.ts", "session-1");
    const r2 = routeToModel("now explain what it does", "session-1");
    expect(r1?.modelOverride).toBe(r2?.modelOverride);
  });

  it("different sessions get independent routing", () => {
    const r1 = routeToModel("write a function in utils.ts", "session-a");
    const r2 = routeToModel("hey what's up?", "session-b");
    // session-a → builder, session-b → scout (speed-chat)
    expect(r1?.modelOverride).not.toBe(r2?.modelOverride);
  });

  it("no sticky when disabled", () => {
    resetRouter({ stickyRouting: false });
    const r1 = routeToModel("write a function in utils.ts", "session-x");
    const r2 = routeToModel("hey what's up?", "session-x");
    // Without sticky, each prompt is classified independently
    expect(r1?.modelOverride).not.toBe(r2?.modelOverride);
  });
});

describe("model kill switches", () => {
  beforeEach(() => resetRouter());

  it("falls back when target model is disabled", () => {
    resetRouter({
      modelEnabled: { ...DEFAULT_CONFIG.modelEnabled, builder: false },
    });
    const d = classify("write a new sorting function in sort.ts");
    // Builder disabled → falls back to operator (first in builder's fallback chain)
    expect(d.role).not.toBe("builder");
    expect(d.reason).toContain("fallback");
  });

  it("worker falls back to thinker (cheapest paid)", () => {
    resetRouter({
      modelEnabled: { ...DEFAULT_CONFIG.modelEnabled, worker: false },
    });
    const d = classify("batch process and normalize all the CSV records");
    expect(d.role).toBe("thinker");
    expect(d.reason).toContain("fallback");
  });

  it("vision falls back to scout (multimodal preserved)", () => {
    resetRouter({
      modelEnabled: { ...DEFAULT_CONFIG.modelEnabled, vision: false },
    });
    const d = classify("watch this video clip and summarize");
    // Vision disabled → scout is first fallback (also multimodal)
    expect(d.role).toBe("scout");
    expect(d.reason).toContain("fallback");
  });
});

describe("rule toggles", () => {
  beforeEach(() => resetRouter());

  it("disabling video rule falls through to next match", () => {
    resetRouter({ rules: { ...DEFAULT_CONFIG.rules, video: false } });
    const d = classify("watch this video about sorting algorithms");
    // Video rule disabled, but no other rule matches strongly → default
    expect(d.role).not.toBe("vision");
  });

  it("disabling heavyCodeGen keeps code prompts on default", () => {
    resetRouter({ rules: { ...DEFAULT_CONFIG.rules, heavyCodeGen: false } });
    const d = classify("write a function to sort arrays in sort.ts");
    expect(d.role).not.toBe("builder");
  });
});

describe("routeToModel", () => {
  beforeEach(() => resetRouter());

  it("returns undefined when disabled", () => {
    resetRouter({ enabled: false });
    expect(routeToModel("write code", "s1")).toBeUndefined();
  });

  it("returns modelOverride and providerOverride", () => {
    const result = routeToModel("hey there", "s2");
    expect(result).toBeDefined();
    expect(result!.modelOverride).toBeDefined();
    expect(result!.providerOverride).toBeDefined();
  });

  it("works without sessionId (no sticky)", () => {
    const result = routeToModel("hey there");
    expect(result).toBeDefined();
  });
});

describe("output shape", () => {
  beforeEach(() => resetRouter());

  it("classify returns all required fields", () => {
    const d = classify("some prompt here");
    expect(d).toHaveProperty("modelOverride");
    expect(d).toHaveProperty("providerOverride");
    expect(d).toHaveProperty("role");
    expect(d).toHaveProperty("reason");
    expect(d).toHaveProperty("estimatedTokens");
    expect(d).toHaveProperty("promptHash");
    expect(typeof d.promptHash).toBe("string");
    expect(d.promptHash).toHaveLength(8);
  });
});
