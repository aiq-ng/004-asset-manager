/** Application-wide constants. Keep tunables here instead of hard-coding them. */

export const ASSET_ID_PREFIX = "IT";
export const ASSET_ID_PAD_LENGTH = 4;

export const PAGINATION_DEFAULT_PAGE_SIZE = 20;
export const PAGINATION_MAX_PAGE_SIZE = 100;

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_ALLOWED_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

/** How long a forgot-password link stays valid. Short, because it is single-use. */
export const PASSWORD_RESET_TTL_MINUTES = 60;