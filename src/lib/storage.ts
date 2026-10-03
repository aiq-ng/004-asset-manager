import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";

export interface UploadInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export interface ObjectStorage {
  ensureBucket(): Promise<void>;
  uploadObject(input: UploadInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

class MinioStorage implements ObjectStorage {
  private readonly bucket: string;
  private readonly expiresInSeconds: number;
  private readonly internalEndpoint: string;
  private readonly publicEndpoint: string | null;
  private readonly clients = new Map<string, S3Client>();
  private bucketReady: Promise<void> | null = null;

  constructor() {
    const env = getEnv();
    this.bucket = env.MINIO_BUCKET;
    this.expiresInSeconds = env.MINIO_PRESIGN_EXPIRY_SECONDS;
    this.internalEndpoint = env.MINIO_ENDPOINT;
    // Browsers must be able to reach MinIO, which may differ from the internal
    // endpoint (e.g. the API talks to `http://minio:9000` over Docker while the
    // client uses `http://localhost:9000`). Signature v4 covers the host, so
    // presigned URLs are generated with the public endpoint and its own client.
    this.publicEndpoint = env.MINIO_PUBLIC_ENDPOINT;
  }

  private client(endpoint: string): S3Client {
    const cached = this.clients.get(endpoint);
    if (cached) return cached;

    const env = getEnv();
    const client = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY,
        secretAccessKey: env.MINIO_SECRET_KEY,
      },
    });
    this.clients.set(endpoint, client);
    return client;
  }

  /** Creates the private bucket on first use. Cached for the process lifetime. */
  async ensureBucket(): Promise<void> {
    this.bucketReady ??= this.createBucketOnce().catch((error: unknown) => {
      // Do not cache the failure: the next request should retry.
      this.bucketReady = null;
      throw error;
    });
    return this.bucketReady;
  }

  private async createBucketOnce(): Promise<void> {
    const client = this.client(this.internalEndpoint);

    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (!isNotFound(error)) throw wrapStorageError(error, "check bucket");
    }

    try {
      await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      // Losing the race against another instance is fine.
      if (isBucketAlreadyOwned(error)) return;
      throw wrapStorageError(error, "create bucket");
    }
  }

  async uploadObject(input: UploadInput): Promise<void> {
    await this.ensureBucket();
    try {
      await this.client(this.internalEndpoint).send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    } catch (error) {
      throw wrapStorageError(error, "upload object");
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.ensureBucket();
    try {
      await this.client(this.internalEndpoint).send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      throw wrapStorageError(error, "delete object");
    }
  }

  async getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const endpoint = this.publicEndpoint ?? this.internalEndpoint;
    try {
      return await getSignedUrl(
        this.client(endpoint),
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds ?? this.expiresInSeconds },
      );
    } catch (error) {
      throw wrapStorageError(error, "sign url");
    }
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchBucket" || status === 404;
}

function isBucketAlreadyOwned(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists";
}

/** SDK failures surface as 502 so clients can tell storage apart from a DB bug. */
function wrapStorageError(error: unknown, action: string): ApiError {
  if (error instanceof ApiError) return error;
  const cause = error instanceof Error ? error.message : String(error);
  return ApiError.storageUnavailable(`Object storage unavailable: could not ${action}`, {
    cause,
  });
}

/** Object key layout: `assets/{assetId}/{uuid}.{ext}`. The DB stores the key, not a URL. */
export function buildObjectKey(assetId: string, extension: string): string {
  return `assets/${assetId}/${randomUUID()}.${extension}`;
}

/**
 * Return photos live beside asset photos in the same bucket, keyed to the
 * assignment they document: `assignments/{assignmentId}/{uuid}.{ext}`. Unlike an
 * asset photo there is nothing to replace — a return is written once — so the
 * uuid keeps the key unique without any replacing semantics.
 */
export function buildAssignmentObjectKey(assignmentId: string, extension: string): string {
  return `assignments/${assignmentId}/${randomUUID()}.${extension}`;
}

let instance: ObjectStorage | undefined;

/** Storage implementation used by the services; swap it to move to AWS S3, etc. */
export function getStorage(): ObjectStorage {
  instance ??= new MinioStorage();
  return instance;
}

/** Test seam: replace the storage backend without touching route handlers. */
export function setStorage(storage: ObjectStorage | undefined): void {
  instance = storage;
}