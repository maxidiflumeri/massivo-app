import { Injectable, Logger } from '@nestjs/common';
import MessageValidator from 'sns-validator';
import type { SnsMessage } from './sns-types';

/**
 * Wrapper sobre `sns-validator` (callback API → Promise) más fácil de mockear.
 * Validar firma garantiza que el payload provino realmente de SNS y no fue alterado.
 */
@Injectable()
export class SnsValidatorAdapter {
  private readonly logger = new Logger(SnsValidatorAdapter.name);
  private readonly validator = new MessageValidator();

  validate(message: SnsMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      this.validator.validate(message as never, (err) => {
        if (err) {
          this.logger.warn(`SNS firma inválida: ${err.message}`);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}
