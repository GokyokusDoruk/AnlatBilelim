import { useRoute } from './lib/router';
import { HomeScreen } from './screens/HomeScreen';
import { RoomScreen } from './screens/RoomScreen';
import { DevPlayground } from './screens/DevPlayground';

export function App() {
  const route = useRoute();
  // Sadece geliştirmede: bileşen önizleme sayfası (üretim derlemesine girmez).
  if (import.meta.env.DEV && route.name === 'dev') return <DevPlayground />;
  // key: oda değişirse tüm alt ağaç (ve bağlantısı) sıfırdan kurulur.
  return route.name === 'room' ? <RoomScreen key={route.code} code={route.code} /> : <HomeScreen />;
}
