import multer from "multer";

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Rota não encontrada." });
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "Uma das imagens ultrapassa o limite de 5 MB.",
      LIMIT_FILE_COUNT: "Você pode enviar no máximo 4 imagens.",
      LIMIT_UNEXPECTED_FILE: "O campo de anexo enviado é inválido."
    };

    res.status(400).json({ error: messages[error.code] || "Falha ao processar os anexos." });
    return;
  }

  if (error?.statusCode && Number.isInteger(error.statusCode)) {
    res.status(error.statusCode).json({ error: error.message || "Solicitação inválida." });
    return;
  }

  console.error("Unhandled request error:", error);
  res.status(500).json({ error: "Não foi possível processar sua solicitação agora." });
}
