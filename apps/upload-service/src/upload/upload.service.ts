import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@mintjobs/config';

export type FileType = 'image' | 'video' | 'document';

const ALLOWED_MIMETYPES: Record<FileType, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  video: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
};

const MAX_FILE_SIZES: Record<FileType, number> = {
  image: 10 * 1024 * 1024,    // 10 MB
  video: 500 * 1024 * 1024,   // 500 MB
  document: 50 * 1024 * 1024, // 50 MB
};

export interface UploadResult {
  metadata?: Record<string, string>;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  fileType: FileType;
  url: string;
  key: string;
}

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    const s3Config = this.configService.s3;
    this.bucket = s3Config.bucket;
    this.s3 = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      }
    });
  }

  validateFile(file: MulterFile, fileType: FileType): void {
    const allowed = ALLOWED_MIMETYPES[fileType];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed for ${fileType}: ${allowed.join(', ')}`,
      );
    }

    const maxSize = MAX_FILE_SIZES[fileType];
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Max size for ${fileType}: ${maxSize / (1024 * 1024)} MB`,
      );
    }
  }

  async uploadToS3(
    file: MulterFile,
    fileType: FileType,
    folder?: string,
    userId?: string,
  ): Promise<UploadResult> {
    const ext = file.originalname.split('.').pop();
    const filename = `${uuidv4()}.${ext}`;
    const prefix = folder ? `${folder.replace(/^\/+|\/+$/g, '')}/` : `${fileType}s/`;
    const key = `${prefix}${filename}`;

    const metadata =
      userId && userId.trim().length > 0
        ? { 'user-id': userId.trim() }
        : undefined;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        ...(metadata ? { Metadata: metadata } : {}),
      }),
    );

    const s3Config = this.configService.s3;
    const url = `https://${this.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;

    return {
      filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      fileType,
      url,
      key,
      metadata,
    };
  }
}

// Local type shim — avoids requiring @types/multer as an explicit dep
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}
