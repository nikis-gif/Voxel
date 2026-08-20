const MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 8_000;

const BLOCKED_SUPPORT_CATEGORIES = Object.freeze([
  "sexual",
  "sexual/minors"
]);

function dataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function blockedCategories(result, categories) {
  if (!result?.categories) return [];
  return categories.filter((category) => result.categories[category] === true);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(response, attempt) {
  const retryAfter = Number.parseFloat(response.headers.get("retry-after") ?? "");
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(Math.ceil(retryAfter * 1000), MAX_RETRY_DELAY_MS);
  }

  const exponential = BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 350);
  return Math.min(exponential + jitter, MAX_RETRY_DELAY_MS);
}

function unavailableError(code = "MODERATION_UNAVAILABLE") {
  const error = new Error("O filtro de segurança está temporariamente indisponível. Aguarde alguns instantes e tente novamente.");
  error.statusCode = 503;
  error.code = code;
  return error;
}

export class ContentModerationService {
  constructor({ apiKey = null, model = "omni-moderation-latest" } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.enabled = Boolean(apiKey);
  }

  async request(input) {
    if (!this.enabled) return null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response;

      try {
        response = await fetch(MODERATION_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: this.model, input }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BASE_RETRY_DELAY_MS * attempt);
          continue;
        }

        const wrapped = unavailableError();
        wrapped.cause = error;
        throw wrapped;
      }

      if (response.ok) {
        const payload = await response.json();
        return payload?.results?.[0] ?? null;
      }

      const body = await response.text().catch(() => "");

      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const delay = retryDelay(response, attempt);
        console.warn(`[moderation] Rate limited by OpenAI. Retrying in ${delay}ms (${attempt}/${MAX_ATTEMPTS}).`);
        await sleep(delay);
        continue;
      }

      console.error(`[moderation] OpenAI moderation returned HTTP ${response.status}: ${body.slice(0, 400)}`);

      if (response.status === 429) {
        throw unavailableError("MODERATION_RATE_LIMITED");
      }

      throw unavailableError();
    }

    throw unavailableError();
  }

  async assertSupportAllowed({ sender, message, files }) {
    if (!this.enabled) return { moderated: false };

    // One multimodal request keeps the support flow cheaper and reduces burst rate limits.
    const input = [
      {
        type: "text",
        text: `Nome ou usuário informado: ${sender}\n\nRelato de suporte:\n${message}`
      },
      ...files.map((file) => ({
        type: "image_url",
        image_url: { url: dataUrl(file) }
      }))
    ];

    const result = await this.request(input);
    const blocked = blockedCategories(result, BLOCKED_SUPPORT_CATEGORIES);

    if (blocked.length > 0) {
      const error = new Error("O texto, o nome informado ou uma das imagens contém conteúdo sexual que não pode ser enviado.");
      error.statusCode = 422;
      error.code = "SUPPORT_CONTENT_BLOCKED";
      throw error;
    }

    return { moderated: true };
  }
}
