import { Component, type ReactNode } from "react";

/** Keeps a failure in one part of the UI (e.g. the WebGL map) from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[MoonAI] ${this.props.label} crashed:`, error.message, error.stack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="glass max-w-md rounded-xl p-6 text-center text-[13px]">
          <p className="text-regolith-50">The {this.props.label} hit an error and was stopped.</p>
          <p className="num mt-2 text-[11px] text-regolith-400">{this.state.error.message}</p>
          <button onClick={() => location.reload()} className="mt-4 rounded-md border border-edge px-3 py-1.5 text-signal">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
