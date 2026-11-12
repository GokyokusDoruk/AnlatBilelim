/**
 * Login yok: tarayıcıya özel rastgele bir oyuncu kimliği ve son kullanılan isim
 * localStorage'da tutulur. Sayfa yenilenince aynı kimlikle odaya geri dönülür.
 */
const ID_KEY = 'tabu.playerId';
const NAME_KEY = 'tabu.name';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // gizli mod vb.
  }
}

let memoryId: string | null = null;

export function getPlayerId(): string {
  const s = storage();
  const existing = s?.getItem(ID_KEY) ?? memoryId;
  if (existing) return existing;
  const id = crypto.randomUUID();
  memoryId = id;
  s?.setItem(ID_KEY, id);
  return id;
}

export function getSavedName(): string {
  return storage()?.getItem(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  storage()?.setItem(NAME_KEY, name);
}
