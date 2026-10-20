import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { getStorageInfo } from '../data/store.ts';
import { applyUpdate, useSwState } from '../pwa/register.ts';
import { useOnline } from './useEnvironment.ts';

/** App-wide notices that must stay visible: storage fallback, offline, update ready. */
export function Banners() {
  const online = useOnline();
  const sw = useSwState();
  const storage = getStorageInfo();
  return (
    <div className="banners">
      {storage.kind === 'memory' && (
        <div className="callout callout-danger" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <strong>Данные не сохраняются.</strong> {storage.error ?? 'Хранилище браузера недоступно.'} После перезагрузки всё созданное пропадёт —
            экспортируйте важное в Настройках.
          </div>
        </div>
      )}
      {!online && (
        <div className="callout callout-warning" role="status">
          <WifiOff size={18} aria-hidden />
          <div>
            Нет сети. Задачи, заметки и документы работают на устройстве; облачный ассистент и загрузка моделей недоступны.
          </div>
        </div>
      )}
      {sw.updateReady && (
        <div className="callout" role="status">
          <RefreshCw size={18} aria-hidden />
          <div className="row-between grow wrap">
            <span>Доступна новая версия RUMBAI. Данные сохранятся.</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={applyUpdate}>
              Обновить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
