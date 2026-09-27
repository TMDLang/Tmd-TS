import { DEFAULT_BASE_URLS, DEFAULT_MODELS } from "./presets.js";
import { AIProviderType,AISettingsState } from "./types.js";

const STORAGE_KEY = "tmd_ai_settings_v1";

export function looksLikeApiKey(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  // Google Gemini API key: starts with AIza
  if (/^AIza[0-9A-Za-z-_]{20,}/.test(trimmed)) return true;
  // Common key prefixes: OpenAI, Anthropic, Groq, GitHub, etc.
  if (/^(sk-|gsk_|ghp_|gho_|xai-)[0-9A-Za-z-_]{15,}/.test(trimmed)) return true;
  // Long base64/alphanumeric tokens with no dots or dashes that look like keys
  if (/^[A-Za-z0-9+/=]{30,}$/.test(trimmed) && !trimmed.includes("-") && !trimmed.includes(".")) return true;
  return false;
}

export function loadAISettings(): AISettingsState {
  const defaultSettings: AISettingsState = {
    activeProvider: "gemini",
    providers: {
      gemini: { apiKey: "", model: DEFAULT_MODELS.gemini },
      openai: { apiKey: "", model: DEFAULT_MODELS.openai },
      groq: { apiKey: "", model: DEFAULT_MODELS.groq, baseUrl: DEFAULT_BASE_URLS.groq },
      anthropic: { apiKey: "", model: DEFAULT_MODELS.anthropic },
      custom: { apiKey: "", model: DEFAULT_MODELS.custom, baseUrl: DEFAULT_BASE_URLS.custom },
    },
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    const providers: AISettingsState["providers"] = {
      gemini: { ...defaultSettings.providers.gemini, ...(parsed.providers?.gemini || {}) },
      openai: { ...defaultSettings.providers.openai, ...(parsed.providers?.openai || {}) },
      groq: { ...defaultSettings.providers.groq, ...(parsed.providers?.groq || {}) },
      anthropic: { ...defaultSettings.providers.anthropic, ...(parsed.providers?.anthropic || {}) },
      custom: { ...defaultSettings.providers.custom, ...(parsed.providers?.custom || {}) },
    };

    // Sanitize any accidentally saved API keys in model field
    (Object.keys(providers) as AIProviderType[]).forEach((p) => {
      const cfg = providers[p];
      if (cfg && looksLikeApiKey(cfg.model)) {
        if (!cfg.apiKey) {
          cfg.apiKey = cfg.model;
        }
        cfg.model = defaultSettings.providers[p].model;
      }
    });

    return {
      activeProvider: parsed.activeProvider || defaultSettings.activeProvider,
      providers,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveAISettings(settings: AISettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save AI settings to localStorage", err);
  }
}
