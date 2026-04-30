import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { EMAIL_QUEUE_NAME, type EmailSendJob } from './email-queue.types';

/**
 * Wrapper sobre la BullMQ Queue para enquolar email-send jobs.
 * Pertenece al producer; el worker se enciende en EmailWorkerService.
 */
@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private queue!: Queue<EmailSendJob>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const queueName = this.config.get<string>('EMAIL_QUEUE_NAME') ?? EMAIL_QUEUE_NAME;
    this.queue = new Queue<EmailSendJob>(queueName, {
      connection: {
        host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
        port: Number(this.config.get<string>('REDIS_PORT') ?? 6379),
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
    this.logger.log(`Email queue ready: ${queueName}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueue(job: EmailSendJob): Promise<string> {
    const j = await this.queue.add('send', job, { jobId: job.reportId });
    return j.id ?? job.reportId;
  }

  getQueue(): Queue<EmailSendJob> {
    return this.queue;
  }
}
