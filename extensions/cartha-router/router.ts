/**
 * Cartha Smart Router — multi-model routing for OpenClaw.
 *
 * Design principles (per user feedback):
 *   - MiMo-V2-Pro is the DEFAULT. Other models only route when genuinely better.
 *   - Hard constraints (video, context window) beat soft preferences (task type).
 *   - Sticky per session — first routing decision locks for that agent run.
 *   - Token estimates (word-based), not raw character count.
 *   - Capability-preserving fallbacks (vision → only multimodal models).
 *   - No raw prompt logging — only route, reason, token estimate, prompt hash.
 *   - Code tasks split: heavy generation → Builder, debug/explain → stays MiMo.
 */

// ─── Model Definitions ──────────────────────────────────────────────────────

export const MODELS = {
  operator: {
    id: "openrouter/xiaomi/mimo-v2-pro",
    name: "MiMo-V2-Pro",
    alias: "operator",
    provider: "openrouter",
    contextWindow: 1_000_000,
    multimodal: false,
    video: false,
  },
  builder: {
    id: "openrouter/minimax/minimax-m2-7",
    name: "MiniMax M2.7",
    alias: "builder",
    provider: "openrouter",
    contextWindow: 1_000_000,
    multimodal: false,
    video: false,
  },
  scout: {
    id: "openrouter/moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    alias: "scout",
    provider: "openrouter",
    contextWindow: 128_000,
    multimodal: true,
    video: false,
  },
  thinker: {
    id: "openrouter/deepseek/deepseek-v3-0324",
    name: "DeepSeek V3.2",
    alias: "thinker",
    provider: "openrouter",
    contextWindow: 128_000,
    multimodal: false,
    video: false,
  },
  vision: {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    alias: "vision",
    provider: "google",
    contextWindow: 1_000_000,
    multimodal: true,
    video: true,
  },
  worker: {
    id: "openrouter/stepfun/step-3.5-flash:free",
    name: "Step 3.5 Flash",
    alias: "worker",
    provider: "openrouter",
    contextWindow: 256_000,
    multimodal: false,
    video: false,
  },
} as const;

export type ModelRole = keyof typeof MODELS;

// ─── Capability-Preserving Fallback Chains ──────────────────────────────────

export const FALLBACK_CHAINS: Record<ModelRole, ModelRole[]> = {
  // Default: operator is the backbone — fall to builder (also 1M ctx), then vision
  operator: ["builder", "vision", "scout"],
  // Code: builder → operator (also 1M, good at agentic), then vision
  builder: ["operator", "vision", "thinker"],
  // Fast/multimodal: scout → vision (also multimodal), then operator
  scout: ["vision", "operator", "builder"],
  // Reasoning: thinker → operator (low hallucination), then builder
  thinker: ["operator", "builder", "scout"],
  // Video/vision: ONLY multimodal fallbacks first, then large-context
  vision: ["scout", "operator", "builder"],
  // Worker: free tier, fall to thinker (cheapest paid), then operator
  worker: ["thinker", "operator", "builder"],
};

// ─── Configuration ──────────────────────────────────────────────────────────

export interface RouterConfig {
  /** Master switch */
  enabled: boolean;
  /** Log routing decisions to console */
  logRouting: boolean;
  /** Lock routing decision for the entire session (no model-hopping mid-task) */
  stickyRouting: boolean;
  /** Default model when no rule matches */
  defaultModel: ModelRole;
  /** Token threshold for long-context routing */
  longContextTokenThreshold: number;
  /** Character threshold for "short chat" speed routing */
  shortChatCharThreshold: number;
  /** Per-model kill switches — disabled models are skipped */
  modelEnabled: Record<ModelRole, boolean>;
  /** Per-rule toggles */
  rules: {
    manualOverride: boolean;
    video: boolean;
    image: boolean;
    longContext: boolean;
    webResearch: boolean;
    heavyCodeGen: boolean;
    deepReasoning: boolean;
    speedChat: boolean;
    dataProcessing: boolean;
  };
}

export const DEFAULT_CONFIG: RouterConfig = {
  enabled: true,
  logRouting: true,
  stickyRouting: true,
  defaultModel: "operator",
  longContextTokenThreshold: 50_000,
  shortChatCharThreshold: 200,
  modelEnabled: {
    operator: true,
    builder: true,
    scout: true,
    thinker: true,
    vision: true,
    worker: true,
  },
  rules: {
    manualOverride: true,
    video: true,
    image: true,
    longContext: true,
    webResearch: true,
    heavyCodeGen: true,
    deepReasoning: true,
    speedChat: true,
    dataProcessing: true,
  },
};

// ─── Sticky Session Cache ───────────────────────────────────────────────────

const sessionRouteCache = new Map<string, RoutingDecision>();

/** Clear stale sessions older than 1 hour */
const SESSION_TTL_MS = 60 * 60 * 1000;
const sessionTimestamps = new Map<string, number>();

function pruneStaleEntries(): void {
  const now = Date.now();
  for (const [key, ts] of sessionTimestamps) {
    if (now - ts > SESSION_TTL_MS) {
      sessionRouteCache.delete(key);
      sessionTimestamps.delete(key);
    }
  }
}

// ─── Token Estimation ───────────────────────────────────────────────────────

/**
 * Estimate token count from text. Uses word-count × 1.3 which handles
 * code-heavy and markdown-heavy prompts better than chars/4.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

// ─── Prompt Hash (for logging, not raw prompt) ─────────────────────────────

function promptHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ─── Detection Helpers ──────────────────────────────────────────────────────

const VIDEO_PATTERNS =
  /\b(video|mp4|mov|avi|webm|mkv|watch this|play this|clip|recording|footage)\b/i;
const IMAGE_PATTERNS =
  /\b(image|screenshot|photo|picture|look at|png|jpg|jpeg|gif|svg|base64|data:image)\b/i;

const WEB_RESEARCH_PATTERNS =
  /\b(search for|find out|look up|browse|latest news|what('s| is) happening|current|recent developments|google)\b/i;
const URL_PATTERN = /https?:\/\/\S+/i;

// Heavy code gen: writing new code, scaffolding, implementing from scratch
const HEAVY_CODE_GEN_PATTERNS =
  /\b(write|create|implement|build|scaffold|generate|add a? ?(new )?function|add a? ?(new )?class|add a? ?(new )?component|add a? ?(new )?endpoint|add a? ?(new )?module|from scratch|boilerplate)\b/i;
const CODE_FENCE_PATTERN = /```[\s\S]*?```/;
const FILE_EXT_PATTERN =
  /\b\w+\.(ts|tsx|js|jsx|py|go|rs|java|rb|swift|kt|c|cpp|h|hpp|cs|vue|svelte)\b/i;

// Deep reasoning: analysis, extraction, comparison, summarization of complex material
const DEEP_REASONING_PATTERNS =
  /\b(analyze|compare|contrast|extract|summarize|break down|evaluate|assess|review|audit|deep dive|root cause|investigate|explain why|reasoning|trade-?offs?)\b/i;

// Data processing: batch ops, formatting, transformation, extraction, conversion
const DATA_PROCESSING_PATTERNS =
  /\b(process|transform|convert|format|parse|clean|normalize|batch|bulk|csv|json|xml|yaml|toml|merge|split|map|filter|flatten|reshape|aggregate|deduplicate|sanitize|validate data|etl|pipeline|ingest)\b/i;

// Conversational tone indicators (for speed routing)
const CONVERSATIONAL_PATTERNS =
  /^(hey|hi|hello|thanks|ok|sure|yes|no|what|how|why|when|where|who|can you|could you|please|yo|sup)\b/i;

// ─── Manual Override Detection ──────────────────────────────────────────────

const MANUAL_PREFIXES: Record<string, ModelRole> = {
  "/thinker": "thinker",
  "/builder": "builder",
  "/scout": "scout",
  "/operator": "operator",
  "/vision": "vision",
  "/worker": "worker",
};

interface ManualOverride {
  role: ModelRole;
  strippedPrompt: string;
}

function detectManualOverride(prompt: string): ManualOverride | null {
  const trimmed = prompt.trimStart();
  for (const [prefix, role] of Object.entries(MANUAL_PREFIXES)) {
    if (trimmed.startsWith(prefix + " ") || trimmed === prefix) {
      return {
        role,
        strippedPrompt: trimmed.slice(prefix.length).trimStart(),
      };
    }
  }
  return null;
}

// ─── Routing Decision ───────────────────────────────────────────────────────

export interface RoutingDecision {
  modelOverride: string;
  providerOverride: string;
  role: ModelRole;
  reason: string;
  estimatedTokens: number;
  promptHash: string;
}

// ─── Core Router ────────────────────────────────────────────────────────────

let _config: RouterConfig = { ...DEFAULT_CONFIG };

/** Override config (mainly for testing) */
export function setConfig(config: Partial<RouterConfig>): void {
  _config = { ...DEFAULT_CONFIG, ...config };
}

/** Get current config */
export function getConfig(): RouterConfig {
  return _config;
}

function resolveModel(role: ModelRole): ModelRole {
  // If the chosen model is disabled, walk the fallback chain
  if (_config.modelEnabled[role]) return role;
  const chain = FALLBACK_CHAINS[role];
  for (const fallback of chain) {
    if (_config.modelEnabled[fallback]) return fallback;
  }
  // Everything disabled? Return default
  return _config.defaultModel;
}

function makeDecision(
  role: ModelRole,
  reason: string,
  prompt: string,
  tokens: number,
): RoutingDecision {
  const resolved = resolveModel(role);
  const model = MODELS[resolved];
  return {
    modelOverride: model.id.startsWith(model.provider + "/")
      ? model.id.slice(model.provider.length + 1)
      : model.id,
    providerOverride: model.provider,
    role: resolved,
    reason: resolved !== role ? `${reason} (fallback: ${role}→${resolved})` : reason,
    estimatedTokens: tokens,
    promptHash: promptHash(prompt),
  };
}

/**
 * Classify a prompt and return the routing decision.
 *
 * Rule evaluation order (hard constraints first):
 *   0. Manual prefix (/builder, /scout, etc.)
 *   1. Video content → Gemini 2.5 Pro (only model with native video)
 *   2. Image/screenshot → Kimi K2.5 (multimodal, fast)
 *   3. Long context (>threshold tokens) → MiMo-V2-Pro (1M ctx, low hallucination)
 *   4. Web research → Kimi K2.5 (fastest, web-native)
 *   5. Heavy code generation → MiniMax M2.7 (best coder)
 *   6. Deep reasoning/analysis → DeepSeek V3.2 (reasoning specialist)
 *   7. Data processing/batch → Step 3.5 Flash (free worker)
 *   8. Speed-sensitive short chat → Kimi K2.5 (103+ tps)
 *   9. Default → MiMo-V2-Pro
 */
export function classify(prompt: string): RoutingDecision {
  const tokens = estimateTokens(prompt);

  // ── Rule 0: Manual override (highest priority, always checked) ──
  if (_config.rules.manualOverride) {
    const manual = detectManualOverride(prompt);
    if (manual) {
      return makeDecision(manual.role, `manual:/${manual.role}`, manual.strippedPrompt, tokens);
    }
  }

  // ── Rule 1: Video content → Gemini (hard constraint) ──
  if (_config.rules.video && VIDEO_PATTERNS.test(prompt)) {
    return makeDecision("vision", "video-content", prompt, tokens);
  }

  // ── Rule 2: Image/screenshot → Kimi K2.5 (hard constraint: multimodal) ──
  if (_config.rules.image && IMAGE_PATTERNS.test(prompt)) {
    return makeDecision("scout", "image-content", prompt, tokens);
  }

  // ── Rule 3: Long context → MiMo-V2-Pro (hard constraint: context window) ──
  if (_config.rules.longContext && tokens > _config.longContextTokenThreshold) {
    return makeDecision("operator", "long-context", prompt, tokens);
  }

  // ── Rule 4: Web research → Kimi K2.5 (tool requirement) ──
  if (
    _config.rules.webResearch &&
    (WEB_RESEARCH_PATTERNS.test(prompt) || URL_PATTERN.test(prompt))
  ) {
    return makeDecision("scout", "web-research", prompt, tokens);
  }

  // ── Rule 5: Heavy code generation → MiniMax M2.7 ──
  if (_config.rules.heavyCodeGen) {
    const hasCodeSignals = HEAVY_CODE_GEN_PATTERNS.test(prompt);
    const hasCodeFences = CODE_FENCE_PATTERN.test(prompt);
    const hasFileExts = FILE_EXT_PATTERN.test(prompt);
    // Only route to Builder for genuinely heavy generation tasks
    // Debug, refactor, explain → stays on MiMo (default)
    if (hasCodeSignals && (hasCodeFences || hasFileExts)) {
      return makeDecision("builder", "heavy-code-gen", prompt, tokens);
    }
    // Standalone generation keywords with strong signal (>10 tokens = not just "write this")
    if (hasCodeSignals && tokens > 10) {
      return makeDecision("builder", "code-gen", prompt, tokens);
    }
  }

  // ── Rule 6: Deep reasoning/analysis → DeepSeek V3.2 ──
  if (_config.rules.deepReasoning && DEEP_REASONING_PATTERNS.test(prompt) && tokens > 15) {
    return makeDecision("thinker", "deep-reasoning", prompt, tokens);
  }

  // ── Rule 7: Data processing/batch tasks → Step 3.5 Flash (free worker) ──
  if (_config.rules.dataProcessing && DATA_PROCESSING_PATTERNS.test(prompt)) {
    return makeDecision("worker", "data-processing", prompt, tokens);
  }

  // ── Rule 8: Speed-sensitive short chat → Kimi K2.5 ──
  if (
    _config.rules.speedChat &&
    prompt.length < _config.shortChatCharThreshold &&
    CONVERSATIONAL_PATTERNS.test(prompt)
  ) {
    return makeDecision("scout", "speed-chat", prompt, tokens);
  }

  // ── Rule 9: Default → MiMo-V2-Pro ──
  return makeDecision(_config.defaultModel, "default", prompt, tokens);
}

// ─── Public Hook Entry Point ────────────────────────────────────────────────

export function routeToModel(
  prompt: string,
  sessionId?: string,
): { modelOverride: string; providerOverride: string } | undefined {
  if (!_config.enabled) return undefined;

  // Sticky routing: reuse first decision for this session
  if (_config.stickyRouting && sessionId) {
    pruneStaleEntries();
    const cached = sessionRouteCache.get(sessionId);
    if (cached) {
      if (_config.logRouting) {
        console.log(
          `[cartha-router] → ${cached.role} (sticky, original reason: ${cached.reason}) ` +
            `[tokens≈${cached.estimatedTokens}, hash=${cached.promptHash}]`,
        );
      }
      return { modelOverride: cached.modelOverride, providerOverride: cached.providerOverride };
    }
  }

  const decision = classify(prompt);

  // Cache for sticky routing
  if (_config.stickyRouting && sessionId) {
    sessionRouteCache.set(sessionId, decision);
    sessionTimestamps.set(sessionId, Date.now());
  }

  if (_config.logRouting) {
    console.log(
      `[cartha-router] → ${MODELS[decision.role].name} (reason: ${decision.reason}) ` +
        `[tokens≈${decision.estimatedTokens}, hash=${decision.promptHash}]`,
    );
  }

  return { modelOverride: decision.modelOverride, providerOverride: decision.providerOverride };
}

// ─── Testing Utilities ──────────────────────────────────────────────────────

export const __testing = {
  sessionRouteCache,
  sessionTimestamps,
  clearCache() {
    sessionRouteCache.clear();
    sessionTimestamps.clear();
  },
} as const;
