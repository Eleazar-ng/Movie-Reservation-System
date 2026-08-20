import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface UploadResult {
  key: string;
  url: string;
}

/**
 * Thin, domain-agnostic wrapper around an S3-compatible object store.
 * Points at MinIO locally; in production point the same client at real
 * S3 (or Cloudinary's S3-compatible endpoint) by changing env vars only —
 * see README "Production Integrations".
 *
 * Deliberately has no knowledge of "posters" or any other business
 * concept — that mapping belongs in whichever domain module uses this
 * (e.g. the movies module in Stage 3).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('storage.bucket')!;
    this.client = new S3Client({
      endpoint: this.config.get<string>('storage.endpoint'),
      region: this.config.get<string>('storage.region'),
      forcePathStyle: this.config.get<boolean>('storage.forcePathStyle'),
      credentials: {
        accessKeyId: this.config.get<string>('storage.accessKeyId')!,
        secretAccessKey: this.config.get<string>('storage.secretAccessKey')!,
      },
    });
  }

  /** Uploads a buffer directly (server-side upload) and returns a signed view URL. */
  async upload(
    buffer: Buffer,
    options: { prefix: string; contentType: string; extension: string },
  ): Promise<UploadResult> {
    const key = `${options.prefix}/${randomUUID()}.${options.extension}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: options.contentType,
      }),
    );

    this.logger.log(`Uploaded object ${key}`);
    return { key, url: await this.getSignedDownloadUrl(key) };
  }

  /** Presigned URL a client can PUT directly to, bypassing the API server for the file bytes. */
  async getSignedUploadUrl(key: string, contentType: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Presigned URL to view/download a private object. */
  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted object ${key}`);
  }
}
