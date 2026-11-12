import { useState, type FormEvent } from 'react';
import { ROOM_CODE_LENGTH } from '@shared/constants';
import { normalizeRoomCode, sanitizeName } from '@shared/validation';
import { Button, Card, Screen, TextInput } from '../components/ui';
import { createRoom, roomExists } from '../lib/api';
import { getSavedName, saveName } from '../lib/identity';
import { navigate } from '../lib/router';
import './screens.css';

export function HomeScreen() {
  const [name, setName] = useState(getSavedName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanName = sanitizeName(name);

  const onCreate = async () => {
    if (!cleanName) return setError('Önce bir isim gir.');
    setBusy('create');
    setError(null);
    try {
      saveName(cleanName);
      const newCode = await createRoom();
      navigate({ name: 'room', code: newCode });
    } catch {
      setError('Oda kurulamadı, tekrar dene.');
      setBusy(null);
    }
  };

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!cleanName) return setError('Önce bir isim gir.');
    const normalized = normalizeRoomCode(code);
    if (!normalized) return setError('Oda kodu 4-6 karakter olmalı.');
    setBusy('join');
    setError(null);
    try {
      if (!(await roomExists(normalized))) {
        setError('Bu kodla bir oda bulunamadı.');
        setBusy(null);
        return;
      }
      saveName(cleanName);
      navigate({ name: 'room', code: normalized });
    } catch {
      setError('Bağlantı hatası, tekrar dene.');
      setBusy(null);
    }
  };

  return (
    <Screen center>
      <div className="brand">
        <h1 className="brand__title">
          <span>Tabu</span> <span>Party</span>
        </h1>
        <p className="brand__subtitle muted">Anlat, çiz, kuklayı oynat. Aynı odada, kendi telefonundan.</p>
      </div>

      <Card>
        <div className="stack">
          <TextInput
            label="İsmin"
            placeholder="Örn. Doruk"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="primary" size="lg" block disabled={!cleanName || busy !== null} onClick={onCreate}>
            {busy === 'create' ? 'Oda kuruluyor…' : 'Oda Kur'}
          </Button>

          <div className="divider">ya da</div>

          <form className="stack" onSubmit={onJoin}>
            <TextInput
              label="Oda kodu"
              variant="code"
              placeholder={'•'.repeat(ROOM_CODE_LENGTH)}
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button type="submit" variant="team-b" block disabled={!cleanName || code.length < 4 || busy !== null}>
              {busy === 'join' ? 'Kontrol ediliyor…' : 'Odaya Katıl'}
            </Button>
          </form>

          {error ? <div className="notice">{error}</div> : null}
        </div>
      </Card>
    </Screen>
  );
}
