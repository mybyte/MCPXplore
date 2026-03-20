import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logToMain } from '@/lib/rendererLog'

type Props = { children: ReactNode }

type State = { hasError: boolean; lastMessage: string | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, lastMessage: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, lastMessage: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logToMain({
      level: 'error',
      source: 'react-error-boundary',
      message: error.message,
      stack: error.stack,
      detail: info.componentStack?.trim()
    })
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, lastMessage: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.lastMessage ?? 'An unexpected error occurred.'} Details were logged to the
            main process console (terminal when running the app in development).
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
