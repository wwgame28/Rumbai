import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { toolMeta } from '../../shared/tools.ts';
import { refreshHealth } from '../ai/health.ts';
import { assistant } from '../assistant/controller.ts';
import { describeAction } from '../agent/executors.ts';
import { runStartupAutomations } from '../automations/engine.ts';
import { usePrefs } from '../data/hooks.ts';
import { ConfirmProvider, useConfirm } from '../ui/Dialog.tsx';
import { ToastProvider } from '../ui/Toast.tsx';
import { Shell } from './Shell.tsx';
import { useApplyPrefs } from './useEnvironment.ts';

export function App() {
  const prefs = usePrefs();
  useApplyPrefs(prefs);
  const reducedMotion = prefs.motion === 'reduced' ? 'always' : prefs.motion === 'full' ? 'never' : 'user';
  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <ToastProvider>
        <ConfirmProvider>
          <Bootstrap />
          <Shell />
        </ConfirmProvider>
      </ToastProvider>
    </MotionConfig>
  );
}

function Bootstrap() {
  const confirm = useConfirm();
  useEffect(() => {
    assistant.setPermissionHandler(async (name, args) => {
      const meta = toolMeta[name];
      const ok = await confirm({
        title: meta.risk === 'destructive' ? 'Ассистент просит удалить данные' : 'Ассистент просит разрешения',
        body: (
          <>
            <p>{describeAction(name, args)}</p>
            <p className="subtle">Действие выполнится только на этом устройстве и попадёт в журнал действий.</p>
          </>
        ),
        confirmLabel: meta.risk === 'destructive' ? 'Удалить' : 'Разрешить',
        cancelLabel: 'Отклонить',
        danger: meta.risk === 'destructive',
      });
      return ok ? 'allow' : 'deny';
    });
    refreshHealth();
    runStartupAutomations().catch(() => {});
    const onOnline = () => refreshHealth();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [confirm]);
  return null;
}
