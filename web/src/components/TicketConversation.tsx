import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import { api } from '../api';
import type { Ticket, TicketMessage, TicketMessagePage, User } from '../types';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface TicketConversationProps {
  ticket: Ticket;
  currentUser: User;
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function TicketConversation({
  ticket,
  currentUser,
}: TicketConversationProps) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);

  const loadLatestMessages = useCallback(async () => {
    try {
      const page = await api.get<TicketMessagePage>(
        `/tickets/${ticket.id}/messages?limit=50`,
      );

      setMessages(page.messages);
      setNextBeforeId(page.pagination.nextBeforeId);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoadingMessages(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadLatestMessages();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadLatestMessages]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      }
    };
  }, []);

  async function loadOlderMessages() {
    if (!nextBeforeId) {
      return;
    }

    setLoadingOlderMessages(true);
    setError(null);

    try {
      const page = await api.get<TicketMessagePage>(
        `/tickets/${ticket.id}/messages?limit=50&beforeId=${nextBeforeId}`,
      );

      setMessages((currentMessages) => [...page.messages, ...currentMessages]);
      setNextBeforeId(page.pagination.nextBeforeId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const selectedImage = event.target.files?.[0] ?? null;

    if (!selectedImage) {
      return;
    }

    if (!SUPPORTED_IMAGE_TYPES.has(selectedImage.type)) {
      setError('Choose a JPEG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }

    if (selectedImage.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Choose an image that is 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    setError(null);
    clearImagePreview();
    setImageFile(selectedImage);
    const previewUrl = URL.createObjectURL(selectedImage);
    imagePreviewUrlRef.current = previewUrl;
    setImagePreviewUrl(previewUrl);
  }

  function removeSelectedImage() {
    clearImagePreview();
    setImageFile(null);
  }

  function clearImagePreview() {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }

    setImagePreviewUrl(null);

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = messageBody.trim();

    if (!body && !imageFile) {
      setError('Write a message or attach an image before sending.');
      return;
    }

    setSendingMessage(true);
    setError(null);

    try {
      let response: { message: TicketMessage };

      if (imageFile) {
        const formData = new FormData();

        if (body) {
          formData.append('body', body);
        }

        formData.append('image', imageFile);
        response = await api.postForm<{ message: TicketMessage }>(
          `/tickets/${ticket.id}/messages`,
          formData,
        );
      } else {
        response = await api.post<{ message: TicketMessage }>(
          `/tickets/${ticket.id}/messages`,
          { body },
        );
      }

      setMessages((currentMessages) => [...currentMessages, response.message]);
      setMessageBody('');
      removeSelectedImage();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSendingMessage(false);
    }
  }

  const isClosed = ticket.status === 'closed';

  return (
    <section
      aria-labelledby={`ticket-${ticket.id}-conversation-title`}
      className="conversation"
    >
      <div className="conversation-heading">
        <div>
          <p className="eyebrow">Ticket #{ticket.id}</p>
          <h2 id={`ticket-${ticket.id}-conversation-title`}>Conversation</h2>
        </div>
        <button
          className="small"
          disabled={loadingMessages}
          onClick={() => void loadLatestMessages()}
          type="button"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div aria-live="polite" className="message error" role="alert">
          {error}
        </div>
      )}

      <div aria-live="polite" className="conversation-thread">
        {loadingMessages ? (
          <div
            aria-label="Loading conversation"
            className="conversation-loading"
          >
            <span className="conversation-skeleton" />
            <span className="conversation-skeleton short" />
            <span className="conversation-skeleton" />
          </div>
        ) : messages.length === 0 ? (
          <div className="conversation-empty">
            <p>No messages yet.</p>
            <span>
              Start the conversation with the details that matter most.
            </span>
          </div>
        ) : (
          <>
            {nextBeforeId && (
              <button
                className="small conversation-load-more"
                disabled={loadingOlderMessages}
                onClick={() => void loadOlderMessages()}
                type="button"
              >
                {loadingOlderMessages
                  ? 'Loading earlier messages…'
                  : 'Load earlier messages'}
              </button>
            )}

            <ol className="conversation-messages">
              {messages.map((message) => {
                const isOwnMessage = message.sender.id === currentUser.id;

                return (
                  <li
                    className={`conversation-message${
                      isOwnMessage ? ' own-message' : ''
                    }`}
                    key={message.id}
                  >
                    <header>
                      <strong>
                        {isOwnMessage ? 'You' : message.sender.userName}
                      </strong>
                      <time dateTime={message.createdAt}>
                        {formatMessageTime(message.createdAt)}
                      </time>
                    </header>

                    {message.body && <p>{message.body}</p>}

                    {message.attachments.map((attachment) => (
                      <figure
                        className="conversation-image"
                        key={attachment.id}
                      >
                        <img
                          alt={`Image attached by ${
                            isOwnMessage ? 'you' : message.sender.userName
                          }`}
                          loading="lazy"
                          src={attachment.imageUrl}
                        />
                      </figure>
                    ))}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {isClosed ? (
        <p className="conversation-read-only">
          This ticket is closed. Its conversation remains available to read.
        </p>
      ) : (
        <form className="conversation-composer" onSubmit={sendMessage}>
          <label htmlFor={`ticket-${ticket.id}-message`}>Reply</label>
          <textarea
            disabled={sendingMessage}
            id={`ticket-${ticket.id}-message`}
            maxLength={2000}
            onChange={(event) => setMessageBody(event.target.value)}
            placeholder="Write a reply…"
            value={messageBody}
          />
          <div className="conversation-composer-actions">
            <input
              accept="image/jpeg,image/png,image/webp"
              aria-describedby={`ticket-${ticket.id}-image-hint`}
              className="file-input"
              disabled={sendingMessage}
              id={`ticket-${ticket.id}-image`}
              onChange={selectImage}
              ref={imageInputRef}
              type="file"
            />
            <label
              className="file-input-label"
              htmlFor={`ticket-${ticket.id}-image`}
            >
              Attach image
            </label>
            <span className="muted" id={`ticket-${ticket.id}-image-hint`}>
              JPEG, PNG, or WebP, up to 5 MB
            </span>
            <span className="character-count">{messageBody.length}/2000</span>
          </div>

          {imageFile && imagePreviewUrl && (
            <div className="conversation-preview">
              <img alt="Selected image preview" src={imagePreviewUrl} />
              <div>
                <strong>{imageFile.name}</strong>
                <span>{Math.ceil(imageFile.size / 1024)} KB</span>
              </div>
              <button
                className="small"
                disabled={sendingMessage}
                onClick={removeSelectedImage}
                type="button"
              >
                Remove
              </button>
            </div>
          )}

          <button className="primary" disabled={sendingMessage} type="submit">
            {sendingMessage
              ? imageFile
                ? 'Uploading image…'
                : 'Sending…'
              : 'Send reply'}
          </button>
        </form>
      )}
    </section>
  );
}
