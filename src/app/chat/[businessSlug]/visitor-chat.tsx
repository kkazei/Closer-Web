'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CloserMark } from '@/app/_components/closer-mark';

type ChatMessage = Readonly<{
  id: number;
  role: 'assistant' | 'user';
  content: string;
}>;

type VisitorChatProps = Readonly<{
  businessName?: string;
  businessSlug: string;
  isDemoBusiness?: boolean;
}>;

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error;
    }
  } catch {
    // Use the fallback if the response is not a JSON error body.
  }

  return fallback;
}

export default function VisitorChat({
  businessName,
  businessSlug,
  isDemoBusiness = false,
}: VisitorChatProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [sending, setSending] = useState(false);
  const nextMessageId = useRef(0);
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function startSession() {
      setStarting(true);
      setError(null);

      try {
        const response = await fetch('/api/chat/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessSlug }),
        });

        if (!response.ok) {
          const message = await readError(response, 'Unable to start this chat.');
          throw new Error(
            isDemoBusiness && message === 'Business not found.'
              ? 'The demo business is not seeded yet. Run npm run demo:seed -- --confirm-development with your development database configured.'
              : message,
          );
        }

        const body: unknown = await response.json();
        const id =
          typeof body === 'object' && body !== null && 'sessionId' in body
            ? body.sessionId
            : null;

        if (typeof id !== 'string') {
          throw new Error('The chat service returned an invalid session.');
        }

        if (!cancelled) {
          setSessionId(id);
          setMessages([
            {
              id: nextMessageId.current++,
              role: 'assistant',
              content: businessName
                ? `Hi! I’m the ${businessName} assistant. Ask me about classes, memberships, or visiting the studio.`
                : 'Hi! What would you like to know?',
            },
          ]);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : 'Unable to start this chat.',
          );
        }
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    }

    void startSession();
    return () => {
      cancelled = true;
    };
  }, [businessName, businessSlug, isDemoBusiness]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();

    if (!sessionId || !message || sending) {
      return;
    }

    setDraft('');
    setError(null);
    setSending(true);
    const userId = nextMessageId.current++;
    const assistantId = nextMessageId.current++;
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessSlug, sessionId, message }),
      });

      if (!response.ok) {
        throw new Error(
          await readError(response, 'Unable to send that message.'),
        );
      }

      if (!response.body) {
        throw new Error('The chat service returned an empty response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        const text = decoder.decode(value, { stream: !done });

        if (text) {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? { ...item, content: item.content + text }
                : item,
            ),
          );
        }

        if (done) {
          break;
        }
      }
    } catch (caught) {
      setMessages((current) => current.filter((item) => item.id !== assistantId));
      setError(
        caught instanceof Error ? caught.message : 'Unable to send that message.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className='visitor-chat-page'>
      <header className='visitor-chat-header'>
        <Link className='dashboard-brand' href='/' aria-label='Closer home'>
          <CloserMark />
          Closer
        </Link>
          <span className='visitor-chat-label'>{businessName ? `${businessName} · guest chat` : 'Guest conversation'}</span>
      </header>

      <section className='visitor-chat-shell' aria-label='Chat with the business assistant'>
        <div className='visitor-chat-title'>
          <p className='dashboard-eyebrow'>{isDemoBusiness ? 'Live product demo' : 'Business assistant'}</p>
          <h1>{businessName ?? 'How can we help?'}</h1>
          <p>{isDemoBusiness ? 'Ask about our sample classes, prices, and studio policies. The business and all details are fictional.' : 'Ask a question about this business. Answers use its ready knowledge sources.'}</p>
        </div>

        <div className='visitor-chat-messages' aria-live='polite' aria-relevant='additions text'>
          {messages.map((message) => (
            <article className={`visitor-chat-message visitor-chat-${message.role}`} key={message.id}>
              <span>{message.role === 'user' ? 'You' : 'Closer'}</span>
              <p>{message.content || (sending ? 'Thinking…' : '')}</p>
            </article>
          ))}
          {starting ? <p className='visitor-chat-status'>Starting a guest session…</p> : null}
          {sessionId && messages.length === 1 && !sending ? (
            <div className='visitor-chat-suggestions' aria-label='Suggested questions'>
              {['What does a monthly membership cost?', 'What are your weekend hours?'].map((suggestion) => (
                <button key={suggestion} onClick={() => setDraft(suggestion)} type='button'>
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          <div ref={endOfMessages} />
        </div>

        {error ? <p className='visitor-chat-error' role='alert'>{error}</p> : null}

        <form className='visitor-chat-form' onSubmit={sendMessage}>
          <label className='sr-only' htmlFor='visitor-chat-message'>Your message</label>
          <textarea
            id='visitor-chat-message'
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder='Ask a question…'
            rows={2}
            value={draft}
          />
          <button className='button button-primary' disabled={!sessionId || sending || !draft.trim()} type='submit'>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        <p className='visitor-chat-footnote'>You are chatting as a guest. No account is needed.</p>
      </section>
    </main>
  );
}
