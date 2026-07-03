import type { MouseEvent } from 'react';
import type { UiSubscription } from '../../app/models';
import { Pressable } from '../../ui/Pressable';
import { Tooltip } from '../../ui/Tooltip';
import type { Theme } from '../../ui/theme';
import { AddServerForm } from './AddServerForm';
import type { AddServerFormProps } from './AddServerForm';

type ServerCatalogProps = {
  groups: UiSubscription[];
  selectedServerId: string;
  refreshAllLoading: boolean;
  importMessage: string;
  theme: Theme;
  accent: string;
  addServer: Omit<AddServerFormProps, 'theme' | 'accent'>;
  onSelect: (id: string) => void;
  onRemove: (id: string, event: MouseEvent) => void;
  onOpenSubscription: (id: string) => void;
  onRefreshAll: () => void;
};

export function ServerCatalog({
  groups,
  selectedServerId,
  refreshAllLoading,
  importMessage,
  theme,
  accent,
  addServer,
  onSelect,
  onRemove,
  onOpenSubscription,
  onRefreshAll,
}: ServerCatalogProps) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ font: "500 17px/1.2 'Source Serif 4', serif", color: theme.ink }}>
          Выбор сервера
        </div>
        {groups.some((group) => group.id !== null) && (
          <Pressable
            className="refresh-all-btn"
            onClick={refreshAllLoading ? undefined : onRefreshAll}
            borderRadius={10}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: `color-mix(in oklch, ${accent} 10%, transparent)`,
                borderRadius: 10,
                padding: '8px 12px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M21 3v5h-5"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 21v-5h5"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div style={{ font: "500 13px/1 'Inter', sans-serif", color: accent }}>Обновить</div>
            </div>
          </Pressable>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {groups.length === 0 && (
          <div
            style={{
              font: "400 13px/1.4 'Inter', sans-serif",
              color: theme.mutedInk,
              paddingBottom: 12,
            }}
          >
            Список пуст. Добавь VLESS-ссылку или URL подписки ниже.
          </div>
        )}

        {groups.map((group) => (
          <div
            key={group.id ?? 'manual'}
            style={{
              flexShrink: 0,
              borderRadius: 16,
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              overflow: 'hidden',
            }}
          >
            <ServerGroupHeader
              group={group}
              theme={theme}
              onOpenSubscription={onOpenSubscription}
            />
            {group.servers.map((server) => {
              const isSelected = server.id === selectedServerId;
              return (
                <Pressable
                  key={server.id}
                  className="server-item"
                  onClick={() => onSelect(server.id)}
                  borderRadius={14}
                  ripple={false}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      cursor: 'default',
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isSelected ? accent : theme.mutedInk,
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <span
                        style={{
                          font: '500 16px/1.3 "Twemoji Country Flags", \'Inter\', sans-serif',
                          color: theme.ink,
                        }}
                      >
                        {server.name}
                      </span>
                      {server.latencyLabel && (
                        <span
                          style={{
                            font: "400 13px/1.3 'Inter', sans-serif",
                            color: theme.mutedInk,
                          }}
                        >
                          {' '}
                          {server.latencyLabel}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <svg
                        className="server-checkmark"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ flexShrink: 0 }}
                      >
                        <path
                          d="M5 13L9.5 17.5L19 7"
                          stroke={accent}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {server.isCustom && (
                      <Tooltip label="Удалить сервер" theme={theme}>
                        <div
                          className="remove-server-btn"
                          onClick={(event) => onRemove(server.id, event)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path
                              className="remove-icon"
                              d="M5 5L19 19M19 5L5 19"
                              stroke={theme.mutedInk}
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      </Tooltip>
                    )}
                  </div>
                </Pressable>
              );
            })}
          </div>
        ))}
      </div>

      {importMessage && (
        <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: accent, padding: '8px 0' }}>
          {importMessage}
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <AddServerForm {...addServer} theme={theme} accent={accent} />
      </div>
    </>
  );
}

function ServerGroupHeader({
  group,
  theme,
  onOpenSubscription,
}: {
  group: UiSubscription;
  theme: Theme;
  onOpenSubscription: (id: string) => void;
}) {
  const content = (
    <div
      style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        cursor: 'default',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ font: "600 15px/1.3 'Inter', sans-serif", color: theme.ink }}>
          {group.name}
        </div>
        {group.announce && (
          <div
            style={{
              font: "400 12px/1.4 'Inter', sans-serif",
              color: theme.mutedInk,
              marginTop: 2,
            }}
          >
            {group.announce}
          </div>
        )}
      </div>
      {group.id && (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0, marginTop: 1 }}
        >
          <path
            d="M9 6L15 12L9 18"
            stroke={theme.mutedInk}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );

  if (!group.id) return content;

  return (
    <Pressable
      className="sub-group-header"
      onClick={() => onOpenSubscription(group.id!)}
      borderRadius={16}
    >
      {content}
    </Pressable>
  );
}
