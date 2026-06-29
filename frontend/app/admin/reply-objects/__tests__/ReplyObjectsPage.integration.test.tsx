import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ReplyObjectsPage from '../page';

// useToast needs a provider in real use; mock it and capture the toast fn.
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

function jsonResponse(body: unknown, ok = true, status = 200): Promise<Response> {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ReplyObjectsPage — integration: save → reload round-trip', () => {
  it('serializes payload as an object (not a string) and refetches the list after a successful save', async () => {
    const fetchMock = vi.fn((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return jsonResponse({ id: 1 }, true, 201);
      return jsonResponse([]); // GET (initial + post-save refetch)
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReplyObjectsPage />);

    fireEvent.click(screen.getByText('+ New Template'));

    // getByLabelText only resolves if the a11y-2 label/htmlFor association is correct.
    fireEvent.change(screen.getByLabelText('Universal ID *'), { target: { value: 'flex_welcome' } });
    fireEvent.change(screen.getByLabelText('Internal Name *'), { target: { value: 'Welcome' } });
    // default type = flex -> raw JSON textarea
    fireEvent.change(screen.getByPlaceholderText('{ ... }'), { target: { value: '{"type":"bubble"}' } });

    fireEvent.click(screen.getByText('Initialize Template'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, opts]) => (opts as RequestInit | undefined)?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      // The acceptance round-trip: payload must be a parsed OBJECT, not the raw JSON string.
      expect(body.payload).toEqual({ type: 'bubble' });
      expect(body.object_id).toBe('flex_welcome');
    });

    // List refetched after save: GET (initial) + POST + GET (refetch) = at least 3 calls.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('reloads a saved template payload back into the form when editing (round-trip prefill)', async () => {
    const saved = {
      id: 7,
      object_id: 'tmpl_promo',
      name: 'Promo Card',
      object_type: 'template',
      payload: {
        template: {
          type: 'buttons',
          title: '',
          text: 'Saved promo text',
          actions: [{ type: 'message', label: 'OK', text: 'OK' }],
        },
      },
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([saved])));

    render(<ReplyObjectsPage />);

    await screen.findByText('Promo Card');

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));

    // Header text + identity fields prefilled from the saved object.
    expect((screen.getByLabelText('Universal ID *') as HTMLInputElement).value).toBe('tmpl_promo');
    expect((screen.getByLabelText('Internal Name *') as HTMLInputElement).value).toBe('Promo Card');

    // The saved payload round-trips through JSON.stringify -> form -> TemplateEditor:
    // the structured editor's text field shows the persisted template.text.
    const textField = screen.getByPlaceholderText('ข้อความที่จะแสดง (text)') as HTMLTextAreaElement;
    expect(textField.value).toBe('Saved promo text');
  });

  it('renders a usable string toast (not the raw array) when the server returns a 422 validation error', async () => {
    const fetchMock = vi.fn((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        // FastAPI RequestValidationError shape: detail is an ARRAY of error objects.
        return jsonResponse(
          { detail: [{ type: 'value_error', loc: ['body', 'payload'], msg: 'text required', input: {} }] },
          false,
          422,
        );
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReplyObjectsPage />);

    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.change(screen.getByLabelText('Universal ID *'), { target: { value: 'bad' } });
    fireEvent.change(screen.getByLabelText('Internal Name *'), { target: { value: 'Bad' } });
    fireEvent.change(screen.getByPlaceholderText('{ ... }'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Initialize Template'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const arg = toastMock.mock.calls[toastMock.mock.calls.length - 1][0] as { description: unknown };
    // plan-2: detail array must be normalized to a string, never passed through as an array.
    expect(typeof arg.description).toBe('string');
    expect(arg.description).toContain('text required');
  });
});
