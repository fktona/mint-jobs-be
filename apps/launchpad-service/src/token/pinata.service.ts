import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@mintjobs/config';

@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private readonly jwt: string;
  private readonly gateway: string;

  constructor(private readonly configService: ConfigService) {
    this.jwt = this.configService.pinata.jwt;
    this.gateway = this.configService.pinata.gateway;
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<{ cid: string; url: string }> {
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(buffer)]), filename);
    formData.append('pinataMetadata', JSON.stringify({ name: filename }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Pinata file upload failed: ${res.status} ${text}`);
      throw new Error(`Pinata upload failed: ${res.status}`);
    }

    const json = (await res.json()) as { IpfsHash: string };
    return { cid: json.IpfsHash, url: `${this.gateway}/ipfs/${json.IpfsHash}` };
  }

  async uploadJson(data: Record<string, any>, name: string): Promise<{ cid: string; url: string }> {
    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.jwt}`,
      },
      body: JSON.stringify({ pinataContent: data, pinataMetadata: { name } }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Pinata JSON upload failed: ${res.status} ${text}`);
      throw new Error(`Pinata JSON upload failed: ${res.status}`);
    }

    const json = (await res.json()) as { IpfsHash: string };
    return { cid: json.IpfsHash, url: `${this.gateway}/ipfs/${json.IpfsHash}` };
  }
}
