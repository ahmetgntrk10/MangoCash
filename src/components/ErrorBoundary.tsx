import { Component, ReactNode } from "react";

interface State { error: Error | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidUpdate(prevProps: { children: ReactNode }) {
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }
  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[CloudEarn] Crash:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center text-foreground">
          <div className="text-5xl">☁️</div>
          <h1 className="text-gradient-primary font-display text-xl font-bold">Cloud Earn</h1>
          <p className="text-sm text-muted-foreground">Something went wrong.</p>
          <pre className="max-w-full overflow-auto rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left text-xs text-destructive">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => location.reload()}
            className="mt-2 rounded-full bg-gradient-primary px-6 py-2 text-sm font-semibold text-primary-foreground"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}