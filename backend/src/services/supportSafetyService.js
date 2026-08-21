const BLOCKED_TEXT_PATTERNS = Object.freeze([
  /\b(?:porn|porno|pornografia|pornografico|pornografica)\b/i,
  /\b(?:nude|nudes|nudity|nudez)\b/i,
  /\b(?:hentai|rule\s*34|r34)\b/i,
  /\b(?:onlyfans|xvideos|pornhub|xnxx|xhamster)\b/i,
  /\b(?:cp|child\s*porn|pornografia\s*infantil)\b/i
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBlockedText(value) {
  const normalized = normalizeText(value);
  return BLOCKED_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export class SupportSafetyService {
  constructor() {
    this.enabled = true;
    this.mode = "local";
  }

  async assertSupportAllowed({ sender, message, files }) {
    if (containsBlockedText(sender) || containsBlockedText(message)) {
      const error = new Error("O nome informado ou a descrição contém conteúdo que não pode ser enviado pelo suporte.");
      error.statusCode = 422;
      error.code = "SUPPORT_CONTENT_BLOCKED";
      throw error;
    }

    const blockedFilename = files.find((file) => containsBlockedText(file.originalname));
    if (blockedFilename) {
      const error = new Error("Um dos nomes de arquivo contém conteúdo que não pode ser enviado pelo suporte.");
      error.statusCode = 422;
      error.code = "SUPPORT_CONTENT_BLOCKED";
      throw error;
    }

    return {
      moderated: true,
      mode: "local",
      imageSemanticScan: false
    };
  }
}
