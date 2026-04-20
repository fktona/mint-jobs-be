import { Entity, Column, PrimaryColumn } from 'typeorm';
import { CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Role } from '@mintjobs/constants';

export enum AuthMethod {
  WALLET = 'wallet',
  EMAIL = 'email',
  GOOGLE = 'google',
  GITHUB = 'github',
}

/**
 * User entity using Privy DID as primary key
 * Privy DID format: did:privy:...
 */
@Entity('users')
export class User {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 255 })
  id: string; // Privy DID (did:privy:...)

  @Column({ name: 'wallet_address', type: 'varchar', length: 255, nullable: true })
  walletAddress?: string;

  @Column({
    name: 'auth_method',
    type: 'enum',
    enum: AuthMethod,
    default: AuthMethod.WALLET,
  })
  authMethod: AuthMethod;

  @Column({
    name: 'role',
    type: 'enum',
    enum: Role,
    default: Role.GUEST,
  })
  role: Role;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({
    type: 'timestamp',
    name: 'created_at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    name: 'updated_at',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    type: 'timestamp',
    name: 'deleted_at',
    nullable: true,
  })
  deletedAt?: Date;
}
