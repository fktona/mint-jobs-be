import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum PaymentType {
  FULL_PAYMENT = 'full_payment',
  MILESTONE = 'milestone',
}

export enum ExperienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  EXPERT = 'expert',
}

export interface Milestone {
  name: string;
  duration?: number; 
  dueDate?: string | null; 
  amount: string | number; 
  description?: string;
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string; // User ID (Privy DID)

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'category', type: 'varchar', length: 255 })
  category: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ name: 'duration', type: 'integer' })
  duration: number; 

  @Column({ name: 'skills', type: 'text', array: true, default: [] })
  skills: string[];

  @Column({ name: 'languages', type: 'text', array: true, default: [] })
  languages: string[];

  @Column({ name: 'pay_range_min', type: 'decimal', precision: 10, scale: 2 })
  payRangeMin: number;

  @Column({ name: 'pay_range_max', type: 'decimal', precision: 10, scale: 2 })
  payRangeMax: number;

  @Column({ name: 'pay_from_currency', type: 'varchar', length: 10, nullable: true })
  payFromCurrency?: string;

  @Column({ name: 'pay_to_currency', type: 'varchar', length: 10, nullable: true })
  payToCurrency?: string; 

  @Column({ name: 'freelancers_count', type: 'integer', nullable: true })
  freelancersCount?: number;

  @Column({
    name: 'payment_type',
    type: 'enum',
    enum: PaymentType,
  })
  paymentType: PaymentType;

  @Column({ name: 'milestones', type: 'jsonb', nullable: true })
  milestones: Milestone[] | null;

  @Column({ name: 'location', type: 'varchar', length: 255, default: 'global' })
  location: string;

  @Column({
    name: 'experience_level',
    type: 'enum',
    enum: ExperienceLevel,
  })
  experienceLevel: ExperienceLevel;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({ name: 'is_draft', type: 'boolean', default: false })
  isDraft: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
