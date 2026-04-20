import { Injectable, ConflictException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User, AuthMethod } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto, FilterUserDto } from './dto';
import { Role } from '@mintjobs/constants';
import { isValidSolanaAddress } from '@mintjobs/utils';
import { PrivyService } from '@mintjobs/privy';
import { ConfigService } from '@mintjobs/config';
import { PaginatedResponse } from '@mintjobs/types';
import { createPaginatedResponse } from '@mintjobs/utils';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private privyService: PrivyService,
    private configService: ConfigService,
  ) {}

  /**
   * Create user from Privy DID
   * Fetches user data from Privy and creates local user record
   */
  async createFromPrivy(privyId: string, role: Role): Promise<User> {
    // Check if user already exists
    const existingUser = await this.usersRepository.findOne({
      where: { id: privyId, deletedAt: IsNull() },
    });

    if (existingUser) {
      return existingUser;
    }

    // Fetch user data from Privy
    const privyUser = await this.privyService.getUser(privyId);
    if (!privyUser) {
      throw new NotFoundException('User not found in Privy');
    }

    // Create user with Privy DID as ID
    const user = this.usersRepository.create({
      id: privyId,
      walletAddress: privyUser.wallet?.address,
      email: privyUser.email?.address,
      authMethod: privyUser.wallet ? AuthMethod.WALLET : AuthMethod.EMAIL,
      role: role ,
      isActive: true,
    });

    return this.usersRepository.save(user);
  }

  /**
   * Validate role and check admin token if needed
   */
  validateAndCheckRole(role: string, adminToken?: string): Role {
    // Check if role is provided
    if (!role) {
      throw new BadRequestException(
        'Role is required. Must be one of: ' + Object.values(Role).join(', '),
      );
    }

    // Validate role enum
    if (!Object.values(Role).includes(role as Role)) {
      throw new BadRequestException(
        `Invalid role. Must be one of: ${Object.values(Role).join(', ')}`,
      );
    }

    const userRole = role as Role;

    // Check admin token for admin/super_admin roles
    if (userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN) {
      const expectedToken = this.configService.admin.adminToken;

      if (!adminToken || adminToken !== expectedToken) {
        throw new UnauthorizedException(
          'Admin token required for ADMIN or SUPER_ADMIN roles',
        );
      }
    }

    return userRole;
  }

  /**
   * Get or create user with role validation
   */
  async getOrCreateUserWithRole(privyId: string, role: string, adminToken?: string): Promise<User> {
    // Validate role and check admin token
    const userRole = this.validateAndCheckRole(role, adminToken);

    // Get or create user
    let user = await this.findOne(privyId).catch(() => null);
    
    if (!user) {
      // Create user with role
      user = await this.createFromPrivy(privyId, userRole);
    } else if (user.role !== userRole) {
      // Update role if different from current role
      user = await this.update(privyId, { role: userRole });
    }

    return user;
  }

  async create(createUserDto: CreateUserDto & { privyId: string }): Promise<User> {
    // Validate wallet address if provided
    if (createUserDto.walletAddress) {
      if (!isValidSolanaAddress(createUserDto.walletAddress)) {
        throw new ConflictException('Invalid wallet address format');
      }

      // Check if wallet already exists
      const existingUser = await this.usersRepository.findOne({
        where: { walletAddress: createUserDto.walletAddress, deletedAt: IsNull() },
      });

      if (existingUser) {
        throw new ConflictException('Wallet address already registered');
      }
    }

    // Validate email if provided
    if (createUserDto.email) {
      const existingUser = await this.usersRepository.findOne({
        where: { email: createUserDto.email, deletedAt: IsNull() },
      });

      if (existingUser) {
        throw new ConflictException('Email already registered');
      }
    }

    const user = this.usersRepository.create({
      id: createUserDto.privyId, // Use Privy DID as ID
      ...createUserDto,
      role: createUserDto.role || Role.GUEST,
    });

    return this.usersRepository.save(user);
  }

  /**
   * Get all users with pagination and filters (admin/super_admin only)
   */
  async findAll(filterDto: FilterUserDto): Promise<PaginatedResponse<User>> {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .where('user.deletedAt IS NULL');

    // Apply filters
    if (filters.role) {
      queryBuilder.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.email) {
      queryBuilder.andWhere('user.email = :email', { email: filters.email });
    }

    if (filters.walletAddress) {
      queryBuilder.andWhere('user.walletAddress = :walletAddress', { walletAddress: filters.walletAddress });
    }

    if (filters.authMethod) {
      queryBuilder.andWhere('user.authMethod = :authMethod', { authMethod: filters.authMethod });
    }

    if (filters.id) {
      queryBuilder.andWhere('user.id = :id', { id: filters.id });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination and ordering
    const users = await queryBuilder
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    return createPaginatedResponse(users, total, page, limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { walletAddress, deletedAt: IsNull() },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email, deletedAt: IsNull() },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Validate wallet address if being updated
    if (updateUserDto.walletAddress) {
      if (!isValidSolanaAddress(updateUserDto.walletAddress)) {
        throw new ConflictException('Invalid wallet address format');
      }

      const existingUser = await this.usersRepository.findOne({
        where: { walletAddress: updateUserDto.walletAddress },
      });

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('Wallet address already registered');
      }
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.softRemove(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, {
      lastLoginAt: new Date(),
    });
  }
}
