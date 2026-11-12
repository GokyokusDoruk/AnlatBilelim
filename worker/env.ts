import type { RoomDurableObject } from './RoomDurableObject';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDurableObject>;
  ASSETS: Fetcher;
}
