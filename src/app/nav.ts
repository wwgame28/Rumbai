import { BookOpen, Bot, Cpu, FolderOpen, LayoutDashboard, ListTodo, NotebookPen, Settings, Workflow, type LucideIcon } from 'lucide-react';
import type { Route } from '../lib/router.ts';

export interface NavItem {
  route: Route;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { route: 'home', label: 'Главная', icon: LayoutDashboard },
  { route: 'assistant', label: 'Ассистент', icon: Bot },
  { route: 'tasks', label: 'Задачи', icon: ListTodo },
  { route: 'notes', label: 'Заметки', icon: NotebookPen },
];

export const MORE_NAV: NavItem[] = [
  { route: 'knowledge', label: 'Знания', icon: BookOpen },
  { route: 'files', label: 'Файлы', icon: FolderOpen },
  { route: 'automations', label: 'Автоматизации', icon: Workflow },
  { route: 'models', label: 'Локальный ИИ', icon: Cpu },
  { route: 'settings', label: 'Настройки', icon: Settings },
];

export const ALL_NAV = [...PRIMARY_NAV, ...MORE_NAV];
