import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

export interface ProjectItem {
  name?: string;
  role?: string;
  link?: string;
}

export interface SocialLinks {
  discord?: string;
  github?: string;
  x?: string;
  linkedin?: string;
}

@Entity('freelancer_profiles')
export class FreelancerProfile extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName?: string;

  @Column({ type: 'text', nullable: true })
  professionalSummary?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category?: string;

  @Column({ type: 'text', array: true, nullable: true })
  selectedSkills?: string[];

  @Column({ type: 'varchar', length: 100, nullable: true })
  expertiseLevel?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  portfolioLink?: string;

  @Column({ type: 'jsonb', nullable: true })
  projects?: ProjectItem[];

  // Future fields (not yet wired in UI)
  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  resumeUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  socialLinks?: SocialLinks;
}
