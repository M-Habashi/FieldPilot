import { Component, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * Chat is a non-essential overlay: a failure inside it (for example the chat
 * functions missing from the Convex deployment) must never take down the
 * whole workspace. Render a closable fallback panel instead.
 */
export class ChatErrorBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('AI chat failed to render', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Button
          variant="ghost"
          className="h-10 w-full shrink-0 rounded-none border-b border-line font-semibold"
          onClick={this.props.onClose}
        >
          <X />
          Close chat
        </Button>
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-sm text-t2">
            The AI chat could not be loaded. Close the panel and try again.
          </p>
        </div>
      </div>
    );
  }
}
