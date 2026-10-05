export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE: "UNPROCESSABLE",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface FieldError {
  path: string;
  message: string;
}

/**
 * Every route handler funnels failures through this class so the HTTP layer can
 * render one consistent shape:
 *   { "error": { "code": "...", "message": "...", "details"?: [...] } }
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  /** 401: no session, expired session, or bad credentials. */
  static unauthenticated(message = "Authentication required"): ApiError {
    return new ApiError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }

  /** 403: authenticated, but the role does not allow this action. */
  static forbidden(message = "You do not have permission to perform this action"): ApiError {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, ERROR_CODES.CONFLICT, message, details);
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, ERROR_CODES.UNPROCESSABLE, message, details);
  }

  static storageUnavailable(message: string, details?: unknown): ApiError {
    return new ApiError(502, ERROR_CODES.STORAGE_UNAVAILABLE, message, details);
  }

  static internal(message = "Internal server error", details?: unknown): ApiError {
    return new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message, details);
  }
}

interface PrismaKnownError extends Error {
  code?: string;
  meta?: {
    modelName?: string;
    target?: string | string[];
    // Prisma 7 forwards the Postgres error through the driver adapter.
    driverAdapterError?: {
      cause?: {
        originalMessage?: string;
        constraint?: { index?: string } | string;
      };
    };
  };
}

function constraintIndex(error: PrismaKnownError): string | undefined {
  const constraint = error.meta?.driverAdapterError?.cause?.constraint;
  if (typeof constraint === "string") return constraint;
  return constraint?.index;
}

/** Human readable field for a unique violation, e.g. `AssetType_code_key` -> `code`. */
function uniqueViolationLabel(error: PrismaKnownError): string {
  const target = error.meta?.target;
  if (Array.isArray(target) && typeof target[0] === "string") return target[0];
  if (typeof target === "string") return target;

  const index = constraintIndex(error);
  if (!index) return "value";
  if (index.includes("one_active_per_asset")) return "active assignment";

  const field = index.replace(/^[A-Za-z0-9]+_/, "").replace(/(_key|_idx)$/, "");
  return field === index ? "value" : field;
}

/**
 * Translates Prisma errors into ApiErrors so route handlers stay thin.
 *   P2002 unique constraint -> 409 conflict
 *   P2003 foreign key        -> 422 (references a record that does not exist)
 *   P2025 record not found   -> 404
 */
export function fromPrismaError(error: unknown, context?: string): ApiError {
  if (error instanceof ApiError) return error;

  const known = error as PrismaKnownError;

  switch (known?.code) {
    case "P2002": {
      const field = uniqueViolationLabel(known);
      const model = known.meta?.modelName;

      // A duplicated serial is the one unique violation a person hits by accident
      // and has to recover from, so it gets a message they can act on and is
      // attached to the field it belongs to rather than floating as a global
      // banner. `Asset.serialNumber must be unique` reads like a stack trace to
      // whoever is halfway through entering a column of them off a sheet.
      if (field === "serialNumber") {
        return ApiError.conflict("That serial number is already on the register.", [
          { path: "serialNumber", message: "This serial number is already registered." },
        ]);
      }

      return ApiError.conflict(
        field === "active assignment"
          ? "Asset already has an active assignment"
          : `${model ? `${model}.` : ""}${field} must be unique`,
      );
    }
    case "P2003":
      return ApiError.unprocessable(
        `${context ? `${context}: ` : ""}referenced record does not exist`,
      );
    case "P2025":
      return ApiError.notFound();
    default:
      return ApiError.internal();
  }
}