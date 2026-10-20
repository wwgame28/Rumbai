import { AnimatePresence, motion } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { navigate, useRoute, type Route } from '../lib/router.ts';
import { spring } from '../motion/presets.ts';
import { Sheet } from '../ui/Sheet.tsx';
import { ALL_NAV, MORE_NAV, PRIMARY_NAV } from './nav.ts';
import { useKeyboardInset, useMediaQuery } from './useEnvironment.ts';
import { Banners } from './Banners.tsx';
import { HomeScreen } from '../screens/home/HomeScreen.tsx';

// Screens other than the dashboard load on demand to keep the first bundle small.
const AssistantScreen = lazy(() => import('../screens/assistant/AssistantScreen.tsx'));
const TasksScreen = lazy(() => import('../screens/tasks/TasksScreen.tsx'));
const NotesScreen = lazy(() => import('../screens/notes/NotesScreen.tsx'));
const KnowledgeScreen = lazy(() => import('../screens/knowledge/KnowledgeScreen.tsx'));
const FilesScreen = lazy(() => import('../screens/files/FilesScreen.tsx'));
const AutomationsScreen = lazy(() => import('../screens/automations/AutomationsScreen.tsx'));
const SettingsScreen = lazy(() => import('../screens/settings/SettingsScreen.tsx'));
const ModelsScreen = lazy(() => import('../screens/models/ModelsScreen.tsx'));

function screenFor(route: Route, param: string | null): ReactNode {
  switch (route) {
    case 'assistant':
      return <AssistantScreen conversationId={param} />;
    case 'tasks':
      return <TasksScreen />;
    case 'notes':
      return <NotesScreen noteId={param} />;
    case 'knowledge':
      return <KnowledgeScreen />;
    case 'files':
      return <FilesScreen />;
    case 'automations':
      return <AutomationsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'models':
      return <ModelsScreen />;
    default:
      return <HomeScreen />;
  }
}

export function Shell() {
  const { route, param } = useRoute();
  const [moreOpen, setMoreOpen] = useState(false);
  const keyboardOpen = useKeyboardInset();
  // Side rail on tablets/desktop and on phones in landscape.
  const rail = useMediaQuery('(min-width: 900px), (orientation: landscape) and (min-width: 640px)');
  const isMoreRoute = MORE_NAV.some((n) => n.route === route);

  return (
    <div className={`app${rail ? ' app-rail' : ''}${keyboardOpen ? ' kb-open' : ''}`} data-route={route}>
      <a href="#main" className="skip-link" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        К содержимому
      </a>
      {rail && (
        <nav className="rail" aria-label="Основная навигация">
          <div className="rail-brand" aria-hidden>
            <span className="brand-mark" />
          </div>
          {ALL_NAV.map((n) => (
            <NavButton key={n.route} item={n} active={route === n.route} variant="rail" />
          ))}
        </nav>
      )}

      <main id="main" tabIndex={-1} className="main">
        <Banners />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route + (route === 'assistant' ? '' : (param ?? ''))}
            className="screen"
            data-screen={route}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.16 }, y: spring.gentle }}
          >
            <Suspense fallback={<div className="screen-loading" role="status">Загрузка…</div>}>{screenFor(route, param)}</Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {!rail && (
        <nav className="tabbar" aria-label="Основная навигация">
          {PRIMARY_NAV.map((n) => (
            <NavButton key={n.route} item={n} active={route === n.route} variant="tab" />
          ))}
          <button type="button" className="tab" aria-current={isMoreRoute ? 'page' : undefined} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
            {isMoreRoute && <motion.span layoutId="tab-active" className="tab-active" transition={spring.snappy} />}
            <MoreHorizontal size={22} aria-hidden />
            <span>Ещё</span>
          </button>
        </nav>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Разделы">
        <div className="list">
          {MORE_NAV.map((n) => (
            <button
              key={n.route}
              type="button"
              className="list-row"
              aria-current={route === n.route ? 'page' : undefined}
              onClick={() => {
                setMoreOpen(false);
                navigate(n.route);
              }}
            >
              <span className="list-row-icon">
                <n.icon size={18} aria-hidden />
              </span>
              <span className="grow">{n.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function NavButton({ item, active, variant }: { item: (typeof ALL_NAV)[number]; active: boolean; variant: 'tab' | 'rail' }) {
  const Icon = item.icon;
  return (
    <button type="button" className={variant === 'rail' ? 'rail-item' : 'tab'} aria-current={active ? 'page' : undefined} onClick={() => navigate(item.route)} title={variant === 'rail' ? item.label : undefined}>
      {active && <motion.span layoutId={`${variant}-active`} className={`${variant}-active`} transition={spring.snappy} />}
      <Icon size={22} aria-hidden />
      <span>{item.label}</span>
    </button>
  );
}
