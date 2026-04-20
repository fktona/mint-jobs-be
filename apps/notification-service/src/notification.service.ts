import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

export interface CreateNotificationDto {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.repo.create({
      recipientId: dto.recipientId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      metadata: dto.metadata ?? null,
      isRead: false,
    });
    return this.repo.save(notification);
  }

  async findForUser(
    recipientId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Notification[]; total: number; unread: number }> {
    const [data, total] = await this.repo.findAndCount({
      where: { recipientId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unread = await this.repo.count({
      where: { recipientId, isRead: false },
    });

    return { data, total, unread };
  }

  async markRead(id: string, recipientId: string): Promise<void> {
    await this.repo.update({ id, recipientId }, { isRead: true });
  }

  async markAllRead(recipientId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('recipient_id = :recipientId', { recipientId })
      .andWhere('is_read = false')
      .execute();
  }

  async unreadCount(recipientId: string): Promise<number> {
    return this.repo.count({ where: { recipientId, isRead: false } });
  }
}
