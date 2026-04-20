import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('client_profiles')
export class ClientProfile extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  timezone?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  website?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'boolean', default: false })
  escrowVerified: boolean;
}
