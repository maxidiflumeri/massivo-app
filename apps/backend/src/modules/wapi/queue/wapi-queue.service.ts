import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WAPI_QUEUE_NAME, type WapiSendJob } from './wapi-queue.types';

@Injectable()
export class WapiQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WapiQueueService.name);
  private queue!: Queue<WapiSendJob>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const queueName = this.config.get<string>('WAPI_QUEUE_NAME') ?? WAPI_QUEUE_NAME;
    this.queue = new Queue<WapiSendJob>(queueName, {
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
    this.logger.log(`Wapi queue ready: ${queueName}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueue(job: WapiSendJob, opts?: { delayMs?: number }): Promise<string> {
    const j = await this.queue.add('send', job, {
      jobId: job.reportId,
      ...(opts?.delayMs ? { delay: opts.delayMs } : {}),
    });
    return j.id ?? job.reportId;
  }

  getQueue(): Queue<WapiSendJob> {
    return this.queue;
  }
}
