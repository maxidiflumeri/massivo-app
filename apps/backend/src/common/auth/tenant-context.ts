import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext } from '@massivo/shared-types';

interface ScopedStore {
  context?: RequestContext;
  skipScope?: boolean;
}

export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<ScopedStore>();

  static run<R>(context: RequestContext, callback: () => R): R {
    return this.storage.run({ context }, callback);
  }

  static runUnscoped<R>(callback: () => R): R {
    return this.storage.run({ skipScope: true }, callback);
  }

  static current(): RequestContext | undefined {
    return this.storage.getStore()?.context;
  }

  static isSkipped(): boolean {
    return this.storage.getStore()?.skipScope === true;
  }
}
