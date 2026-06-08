import { Injectable } from '@nestjs/common';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { MessengerAdapter } from './adapters/messenger.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { WebchatAdapter } from './adapters/webchat.adapter';
import type { ChannelAdapter, ChannelCapabilities, ChannelKind } from './adapter.types';

/**
 * Fase 1 — Registro de adapters de canal. El motor/inbox/webhook resuelven el
 * adapter por `ChannelKind` en vez de hablar con un proveedor concreto. Sumar
 * Instagram/Messenger/Webchat = registrar su adapter acá; el resto no cambia.
 */
@Injectable()
export class ChannelAdapterRegistry {
  private readonly adapters = new Map<ChannelKind, ChannelAdapter>();

  constructor(
    whatsapp: WhatsAppAdapter,
    messenger: MessengerAdapter,
    instagram: InstagramAdapter,
    webchat: WebchatAdapter,
  ) {
    this.register(whatsapp);
    this.register(messenger);
    this.register(instagram);
    this.register(webchat);
  }

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.kind, adapter);
  }

  /** Devuelve el adapter del kind o lanza si no está registrado. */
  get(kind: ChannelKind): ChannelAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(`No hay ChannelAdapter registrado para kind=${kind}`);
    }
    return adapter;
  }

  capabilities(kind: ChannelKind): ChannelCapabilities {
    return this.get(kind).capabilities;
  }

  has(kind: ChannelKind): boolean {
    return this.adapters.has(kind);
  }
}
