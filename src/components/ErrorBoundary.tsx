'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
            <div className="text-4xl">⚠️</div>
            <div className="text-center space-y-1">
              <p className="text-white font-semibold">Algo salió mal</p>
              <p className="text-gray-500 text-sm">
                {this.state.error?.message ?? 'Error inesperado'}
              </p>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="btn-primary"
            >
              Reintentar
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
