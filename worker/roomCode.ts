import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/constants';

/** Kriptografik rastgele, karıştırılması zor karakterlerden oluşan oda kodu. */
export function generateRoomCode(length = ROOM_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return code;
}
