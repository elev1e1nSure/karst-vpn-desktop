import type { ReactNode } from 'react';
import { Pressable } from './Pressable';
import { Tooltip } from './Tooltip';
import type { Theme } from './theme';

export type AppTab = 'connection' | 'logs' | 'settings';

const EXPANDED_WIDTH = 208;
// Collapsed sidebar shrinks to exactly one square tile (ITEM_SIZE) plus
// the nav's horizontal padding on each side.
const ITEM_SIZE = 52;
const NAV_PAD_X = 8;
const COLLAPSED_WIDTH = ITEM_SIZE + NAV_PAD_X * 2;

type TabDef = { id: AppTab; label: string; icon: (color: string) => ReactNode };

const TABS: TabDef[] = [
  {
    id: 'connection',
    label: 'Подключение',
    icon: (color) => (
      <svg
        className="sidebar-icon sidebar-icon-connection"
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="M12 3V12" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
        <path
          d="M6.5 6.5C5 8.1 4 10.2 4 12.5C4 17.2 7.8 21 12.5 21C17.2 21 21 17.2 21 12.5C21 10.1 19.9 7.9 18.3 6.4"
          stroke={color}
          strokeWidth="1.9"
          strokeLinecap="round"
          fill="none"
          transform="translate(-0.5,0)"
        />
      </svg>
    ),
  },
  {
    id: 'logs',
    label: 'Логи',
    icon: (color) => (
      <svg
        className="sidebar-icon sidebar-icon-logs"
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          className="sidebar-log-line"
          d="M5 6H19"
          stroke={color}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          className="sidebar-log-line"
          d="M5 10H19"
          stroke={color}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          className="sidebar-log-line"
          d="M5 14H15"
          stroke={color}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          className="sidebar-log-line"
          d="M5 18H12"
          stroke={color}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Настройки',
    icon: (color) => (
      <svg
        className="sidebar-icon sidebar-icon-settings"
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"
          stroke={color}
          strokeWidth="1.7"
        />
        <path
          d="M19.4 13.5C19.46 13.01 19.5 12.51 19.5 12C19.5 11.49 19.46 10.99 19.4 10.5L21.34 8.97C21.53 8.82 21.58 8.55 21.46 8.34L19.74 5.36C19.62 5.15 19.36 5.07 19.14 5.15L16.87 6.06C16.18 5.53 15.42 5.11 14.6 4.82L14.25 2.42C14.21 2.18 14.01 2 13.77 2H10.33C10.09 2 9.89 2.18 9.85 2.42L9.5 4.82C8.68 5.11 7.92 5.54 7.23 6.06L4.96 5.15C4.74 5.07 4.48 5.15 4.36 5.36L2.64 8.34C2.52 8.55 2.57 8.82 2.76 8.97L4.7 10.5C4.64 10.99 4.6 11.5 4.6 12C4.6 12.5 4.64 13.01 4.7 13.5L2.76 15.03C2.57 15.18 2.52 15.45 2.64 15.66L4.36 18.64C4.48 18.85 4.74 18.93 4.96 18.85L7.23 17.94C7.92 18.47 8.68 18.89 9.5 19.18L9.85 21.58C9.89 21.82 10.09 22 10.33 22H13.77C14.01 22 14.21 21.82 14.25 21.58L14.6 19.18C15.42 18.89 16.18 18.46 16.87 17.94L19.14 18.85C19.36 18.93 19.62 18.85 19.74 18.64L21.46 15.66C21.58 15.45 21.53 15.18 21.34 15.03L19.4 13.5Z"
          stroke={color}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function Sidebar({
  theme,
  accent,
  activeTab,
  collapsed,
  onSelectTab,
  onToggleCollapsed,
}: {
  theme: Theme;
  accent: string;
  activeTab: AppTab;
  collapsed: boolean;
  onSelectTab: (tab: AppTab) => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <nav
      className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}
      style={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        flexShrink: 0,
        boxSizing: 'border-box',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.sidebarBg,
        padding: `14px ${NAV_PAD_X}px`,
        gap: 7,
      }}
    >
      <Tooltip label={collapsed ? 'Развернуть' : 'Свернуть'} theme={theme} placement="bottom">
        <Pressable
          onClick={onToggleCollapsed}
          className="sidebar-toggle"
          borderRadius={14}
          style={{
            width: ITEM_SIZE,
            height: ITEM_SIZE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginBottom: 6,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect
              x="3"
              y="4.5"
              width="18"
              height="15"
              rx="3"
              stroke={theme.mutedInk}
              strokeWidth="1.9"
            />
            <line x1="9.5" y1="4.5" x2="9.5" y2="19.5" stroke={theme.mutedInk} strokeWidth="1.9" />
          </svg>
        </Pressable>
      </Tooltip>

      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        const color = active ? accent : theme.mutedInk;
        return (
          <Pressable
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}
            borderRadius={14}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: ITEM_SIZE,
              padding: 0,
              overflow: 'hidden',
              background: active
                ? `color-mix(in oklch, ${accent} 14%, transparent)`
                : 'transparent',
            }}
          >
            {/* Fixed-size square icon tile anchored at the left edge: it stays put
                while the sidebar width animates, and is all that remains when collapsed. */}
            <span
              style={{
                width: ITEM_SIZE,
                height: ITEM_SIZE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {tab.icon(color)}
            </span>
            <span
              className="sidebar-label"
              style={{
                color: active ? theme.ink : theme.mutedInk,
              }}
            >
              {tab.label}
            </span>
          </Pressable>
        );
      })}
    </nav>
  );
}
