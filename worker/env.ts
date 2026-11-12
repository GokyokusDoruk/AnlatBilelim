import type { RoomDurableObject } from './RoomDurableObject';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDurableObject>;
  ASSETS: Fetcher;
  /** Yerel geliştirmede '1' (`.dev.vars`). Üretimde tanımlı değildir. */
  DEV_TOOLS?: string;
}
