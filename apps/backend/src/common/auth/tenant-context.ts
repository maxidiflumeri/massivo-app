import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext } from '@massivo/shared-types';

export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<RequestContext>();

  static run<R>(context: RequestContext, callback: () => R): R {
    return this.storage.run(context, callback);
  }

  static current(): RequestContext | undefined {
    return this.storage.getStore();
  }
}
