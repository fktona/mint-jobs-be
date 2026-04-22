import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('communities')
export class Community extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'ca', type: 'varchar', length: 255 })
  ca: string; // token contract address

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'symbol', type: 'varchar', length: 50 })
  symbol: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl?: string;
}
