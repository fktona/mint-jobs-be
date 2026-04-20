import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('saved_jobs')
@Unique('uq_saved_jobs_user_job', ['userId', 'jobId'])
export class SavedJob extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'job_id', type: 'varchar', length: 255 })
  jobId: string;
}
