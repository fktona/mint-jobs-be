import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { ResponseUtil } from '@mintjobs/utils';
import { UploadService, MulterFile } from './upload.service';

const inMemory = { storage: memoryStorage() };

@ApiTags('upload')
@Controller('upload')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @ApiOperation({ summary: 'Upload a single image (jpeg, png, gif, webp, svg) to S3' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'folder', required: false, description: 'S3 folder/prefix to store the file in (e.g. avatars, projects/thumbnails)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', inMemory))
  async uploadImage(
    @UploadedFile() file: MulterFile,
    @Query('folder') folder?: string,
    @PrivyUser('privyId') userId?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    this.uploadService.validateFile(file, 'image');
    const result = await this.uploadService.uploadToS3(file, 'image', folder, userId);
    return ResponseUtil.success(result, 'Image uploaded successfully');
  }

  @Post('video')
  @ApiOperation({ summary: 'Upload a single video (mp4, mpeg, quicktime, webm, avi) to S3' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'folder', required: false, description: 'S3 folder/prefix to store the file in (e.g. freelancer/reels)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', inMemory))
  async uploadVideo(
    @UploadedFile() file: MulterFile,
    @Query('folder') folder?: string,
    @PrivyUser('privyId') userId?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    this.uploadService.validateFile(file, 'video');
    const result = await this.uploadService.uploadToS3(file, 'video', folder, userId);
    return ResponseUtil.success(result, 'Video uploaded successfully');
  }

  @Post('document')
  @ApiOperation({ summary: 'Upload a single document (pdf, doc, docx, txt) to S3' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'folder', required: false, description: 'S3 folder/prefix to store the file in (e.g. resumes, contracts)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', inMemory))
  async uploadDocument(
    @UploadedFile() file: MulterFile,
    @Query('folder') folder?: string,
    @PrivyUser('privyId') userId?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    this.uploadService.validateFile(file, 'document');
    const result = await this.uploadService.uploadToS3(file, 'document', folder, userId);
    return ResponseUtil.success(result, 'Document uploaded successfully');
  }
}
