import {
  IMAGE_ALLOWED_EXTENSIONS,
  IMAGE_ALLOWED_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
} from "@/lib/config";
import { ApiError } from "@/lib/errors";

export interface ParsedImage {
  buffer: Buffer;
  contentType: (typeof IMAGE_ALLOWED_TYPES)[number];
  extension: string;
}

/**
 * Identifies the real format from the file's magic bytes. The browser supplied
 * Content-Type is advisory only, so it is never trusted on its own.
 */
export function detectImageType(buffer: Buffer): (typeof IMAGE_ALLOWED_TYPES)[number] | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && pngSignature.every((byte, index) => buffer[index] === byte)) {
    return "image/png";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

/** Validates an uploaded image and returns its bytes plus the sniffed type. */
export async function parseUploadedImage(file: File): Promise<ParsedImage> {
  if (file.size === 0) {
    throw ApiError.badRequest("Uploaded file is empty", [
      { path: "file", message: "file must not be empty" },
    ]);
  }

  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw ApiError.badRequest("Uploaded file is too large", [
      { path: "file", message: `file must be <= ${IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024)} MB` },
    ]);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = detectImageType(buffer);

  if (!contentType) {
    throw ApiError.badRequest("Unsupported image format", [
      {
        path: "file",
        message: `file must be one of: ${IMAGE_ALLOWED_TYPES.join(", ")}`,
      },
    ]);
  }

  return {
    buffer,
    contentType,
    extension: IMAGE_ALLOWED_EXTENSIONS[contentType],
  };
}
