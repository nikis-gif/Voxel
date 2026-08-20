const MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations";
const REQUEST_TIMEOUT_MS = 15_000;

const BLOCKED_SENDER_CATEGORIES = Object.freeze([
  "sexual",
  "sexual/minors",
  "hate",
  "hate/threatening",
  "harassment/threatening"
]);

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

export class ContentModerationService {
  constructor({ apiKey = null, model = "omni-moderation-latest" } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.enabled = Boolean(apiKey);
  }

  async request(input) {
    if (!this.enabled) return null;

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
      const wrapped = new Error("O filtro de segurança está temporariamente indisponível. Tente novamente em alguns instantes.");
      wrapped.statusCode = 503;
      wrapped.cause = error;
      throw wrapped;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[moderation] OpenAI moderation returned HTTP ${response.status}: ${body.slice(0, 400)}`);

      const error = new Error("O filtro de segurança está temporariamente indisponível. Tente novamente em alguns instantes.");
      error.statusCode = 503;
      throw error;
    }

    const payload = await response.json();
    return payload?.results?.[0] ?? null;
  }

  async assertSupportAllowed({ sender, message, files }) {
    if (!this.enabled) return { moderated: false };

    const senderResult = await this.request(sender);
    const senderBlocked = blockedCategories(senderResult, BLOCKED_SENDER_CATEGORIES);
    if (senderBlocked.length > 0) {
      const error = new Error("O nome informado contém conteúdo que não é permitido na Central de Suporte.");
      error.statusCode = 422;
      error.code = "SUPPORT_SENDER_BLOCKED";
      throw error;
    }

    const contentInput = [
      { type: "text", text: message },
      ...files.map((file) => ({
        type: "image_url",
        image_url: { url: dataUrl(file) }
      }))
    ];
    const contentResult = await this.request(contentInput);
    const contentBlocked = blockedCategories(contentResult, BLOCKED_SUPPORT_CATEGORIES);
    if (contentBlocked.length > 0) {
      const error = new Error("O texto ou uma das imagens contém conteúdo sexual explícito e não pode ser enviado.");
      error.statusCode = 422;
      error.code = "SUPPORT_CONTENT_BLOCKED";
      throw error;
    }

    return { moderated: true };
  }
}
