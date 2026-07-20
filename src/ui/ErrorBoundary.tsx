import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            padding: 32,
            boxSizing: 'border-box',
            fontFamily:
              "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            background: '#1A1A19',
            color: '#EAE8E4',
          }}
        >
          <div style={{ font: "500 18px/1.3 'Source Serif 4', serif" }}>Что-то пошло не так</div>
          <div
            style={{
              font: "400 13px/1.5 'Inter', sans-serif",
              color: '#98948E',
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            {this.state.error.message}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: 8,
              padding: '10px 28px',
              borderRadius: 10,
              background: '#D97757',
              color: '#1A1A19',
              border: 'none',
              font: "500 14px 'Inter', sans-serif",
              cursor: 'pointer',
            }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
