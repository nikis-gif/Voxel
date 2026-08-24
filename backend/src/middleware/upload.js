import multer from "multer";

const MAX_FILES = 4;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const storage = multer.memoryStorage();

export const supportUpload = multer({
  storage,
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE,
    // type, sender, discordUsername, message and honeypot website
    fields: 5,
    fieldSize: 8 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      const error = new Error("Unsupported image type");
      error.statusCode = 400;
      callback(error);
      return;
    }

    callback(null, true);
  }
});

export const reportUpload = multer({
  storage,
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE,
    fields: 6,
    fieldSize: 12 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      const error = new Error("Unsupported image type");
      error.statusCode = 400;
      callback(error);
      return;
    }
    callback(null, true);
  }
});
