import { Pressable } from '../../ui/Pressable';
import type { Theme } from '../../ui/theme';

export type AddServerFormProps = {
  open: boolean;
  value: string;
  error: string;
  loading: boolean;
  theme: Theme;
  accent: string;
  onOpen: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function AddServerForm({
  open,
  value,
  error,
  loading,
  theme,
  accent,
  onOpen,
  onCancel,
  onChange,
  onSubmit,
}: AddServerFormProps) {
  if (!open) {
    return (
      <Pressable className="add-server-trigger" onClick={onOpen} borderRadius={14}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 10px',
            borderRadius: 14,
            border: `1.5px solid ${theme.border}`,
            cursor: 'default',
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: theme.cardBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ font: "400 15px/1 'Inter', sans-serif", color: theme.mutedInk }}>+</span>
          </div>
          <span style={{ font: "500 14px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
            Добавить VLESS или подписку
          </span>
        </div>
      </Pressable>
    );
  }

  return (
    <div
      className="add-server-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        borderRadius: 14,
        background: theme.cardBg,
      }}
    >
      <div style={{ font: "500 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
        VLESS-ссылка или URL подписки
      </div>
      <input
        className="add-server-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="vless://... или https://.../sub/..."
        disabled={loading}
        style={{
          font: "400 13px/1.4 ui-monospace, 'Cascadia Mono', monospace",
          color: theme.ink,
          background: theme.pageBg,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: '10px 12px',
        }}
      />
      {error && (
        <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.danger }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Pressable onClick={onCancel} disabled={loading} style={{ flex: 1, borderRadius: 10 }}>
          <div
            className="btn-cancel"
            style={{
              textAlign: 'center',
              padding: 10,
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              font: "500 13px/1 'Inter', sans-serif",
              color: theme.mutedInk,
            }}
          >
            Отмена
          </div>
        </Pressable>
        <Pressable onClick={loading ? undefined : onSubmit} style={{ flex: 1, borderRadius: 10 }}>
          <div
            className="btn-submit"
            style={{
              textAlign: 'center',
              padding: 10,
              borderRadius: 10,
              background: `color-mix(in oklch, ${accent} 100%, transparent)`,
              font: "500 13px/1 'Inter', sans-serif",
              color: '#fff',
            }}
          >
            Добавить
          </div>
        </Pressable>
      </div>
    </div>
  );
}
