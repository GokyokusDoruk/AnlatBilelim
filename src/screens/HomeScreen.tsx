import { useState, type FormEvent } from 'react';
import { ROOM_CODE_LENGTH } from '@shared/constants';
import { normalizeRoomCode, sanitizeName } from '@shared/validation';
import { Button, Card, Screen, TextInput } from '../components/ui';
import { createRoom, roomExists } from '../lib/api';
import { getSavedName, saveName } from '../lib/identity';
import { navigate } from '../lib/router';
import './screens.css';

type Step = 'name' | 'menu' | 'join';

/**
 * Giriş akışı: önce isim, sonra "Oda Kur" ya da "Kod ile Gir".
 * Kayıtlı isim varsa alana hazır gelir ama her açılışta onaylatılır.
 */
export function HomeScreen() {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(getSavedName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanName = sanitizeName(name);

  const onNameSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!cleanName) return setError('Önce bir isim gir.');
    saveName(cleanName);
    setError(null);
    setStep('menu');
  };

  const onCreate = async () => {
    if (!cleanName) return;
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
    if (!cleanName) return;
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

  const changeName = () => {
    setStep('name');
    setError(null);
    setCode('');
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
        {step === 'name' ? (
          <form className="stack" onSubmit={onNameSubmit}>
            <TextInput
              label="İsmin ne?"
              placeholder="Örn. Doruk"
              value={name}
              maxLength={16}
              autoComplete="nickname"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" variant="primary" size="lg" block disabled={!cleanName}>
              Devam
            </Button>
            {error ? <div className="notice">{error}</div> : null}
          </form>
        ) : (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                Merhaba, <strong>{cleanName}</strong>
              </span>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={changeName}>
                İsmi değiştir
              </Button>
            </div>

            <Button variant="primary" size="lg" block disabled={busy !== null} onClick={onCreate}>
              {busy === 'create' ? 'Oda kuruluyor…' : 'Oda Kur'}
            </Button>

            <div className="divider">ya da</div>

            {step === 'menu' ? (
              <Button variant="team-b" size="lg" block disabled={busy !== null} onClick={() => setStep('join')}>
                Kod ile Gir
              </Button>
            ) : (
              <form className="stack" onSubmit={onJoin}>
                <TextInput
                  label="Oda kodu"
                  variant="code"
                  placeholder={'•'.repeat(ROOM_CODE_LENGTH)}
                  value={code}
                  maxLength={6}
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <Button type="submit" variant="team-b" size="lg" block disabled={code.length < 4 || busy !== null}>
                  {busy === 'join' ? 'Kontrol ediliyor…' : 'Odaya Gir'}
                </Button>
              </form>
            )}

            {error ? <div className="notice">{error}</div> : null}
          </div>
        )}
      </Card>
    </Screen>
  );
}
