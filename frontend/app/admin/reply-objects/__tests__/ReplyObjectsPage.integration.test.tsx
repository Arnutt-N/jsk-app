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

  // react-2 — internal editor keys must never leak into the saved payload.
  it('strips internal _key fields from the payload before saving an edited template', async () => {
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
    const fetchMock = vi.fn((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT') return jsonResponse({ id: 7 });
      return jsonResponse([saved]);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReplyObjectsPage />);
    await screen.findByText('Promo Card');

    // handleEdit tags editor list items with internal `_key`s for stable React keys…
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
    fireEvent.click(screen.getByText('Save Modifications'));

    // …but the serialized payload must keep the exact LINE shape (no `_key`).
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(JSON.stringify(body.payload)).not.toContain('_key');
      expect(body.payload.template.actions[0]).toEqual({ type: 'message', label: 'OK', text: 'OK' });
    });
  });

  // sec-1 — uri actions outside the scheme allowlist must never reach the API.
  it('blocks saving a payload containing a javascript: uri action and shows a Thai error', async () => {
    const fetchMock = vi.fn(() => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReplyObjectsPage />);

    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.change(screen.getByLabelText('Universal ID *'), { target: { value: 'evil' } });
    fireEvent.change(screen.getByLabelText('Internal Name *'), { target: { value: 'Evil' } });
    fireEvent.change(screen.getByPlaceholderText('{ ... }'), {
      target: {
        value: JSON.stringify({
          type: 'bubble',
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'button', action: { type: 'uri', label: 'x', uri: 'javascript:alert(1)' } }],
          },
        }),
      },
    });
    fireEvent.click(screen.getByText('Initialize Template'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const arg = toastMock.mock.calls[toastMock.mock.calls.length - 1][0] as { description: string };
    expect(arg.description).toContain('ลิงก์ไม่ปลอดภัยหรือไม่รองรับ');

    const postCall = (fetchMock.mock.calls as unknown[][]).find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCall).toBeUndefined();
  });
});

describe('ReplyObjectsPage — integration: delete error handling (ts-4)', () => {
  const saved = {
    id: 3,
    object_id: 'to_delete',
    name: 'Delete Me',
    object_type: 'text',
    payload: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  };

  async function openAndConfirmDelete() {
    render(<ReplyObjectsPage />);
    await screen.findByText('Delete Me');

    fireEvent.click(screen.getByRole('button', { name: 'ลบ' }));
    // The confirm dialog's own "ลบ" button is portal-appended last in the DOM.
    const deleteButtons = screen.getAllByRole('button', { name: 'ลบ' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
  }

  it('refetches the list only after a successful delete', async () => {
    const fetchMock = vi.fn((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return jsonResponse({});
      return jsonResponse([saved]);
    });
    vi.stubGlobal('fetch', fetchMock);

    await openAndConfirmDelete();

    await waitFor(() => {
      // initial GET + DELETE + refetch GET
      const gets = fetchMock.mock.calls.filter(([, opts]) => !(opts as RequestInit | undefined)?.method);
      expect(gets.length).toBe(2);
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('shows a Thai error toast and does not refetch when the delete fails', async () => {
    const fetchMock = vi.fn((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return jsonResponse({ detail: 'ลบไม่ได้ มีการใช้งานอยู่' }, false, 409);
      return jsonResponse([saved]);
    });
    vi.stubGlobal('fetch', fetchMock);

    await openAndConfirmDelete();

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const arg = toastMock.mock.calls[toastMock.mock.calls.length - 1][0] as {
      title: string;
      description: string;
      variant: string;
    };
    expect(arg.title).toBe('ผิดพลาด');
    expect(arg.description).toBe('ลบไม่ได้ มีการใช้งานอยู่');
    expect(arg.variant).toBe('error');

    // No refetch after a failed delete: exactly one initial GET.
    const gets = fetchMock.mock.calls.filter(([, opts]) => !(opts as RequestInit | undefined)?.method);
    expect(gets.length).toBe(1);
  });

  it('shows a Thai error toast when the delete request throws (network failure)', async () => {
    const fetchMock = vi.fn((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.reject(new Error('network down'));
      return jsonResponse([saved]);
    });
    vi.stubGlobal('fetch', fetchMock);

    await openAndConfirmDelete();

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const arg = toastMock.mock.calls[toastMock.mock.calls.length - 1][0] as { description: string };
    expect(arg.description).toBe('ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  });
});

describe('ReplyObjectsPage — integration: legacy payload backward-compat (tcq-9)', () => {
  it('opens the edit form for a legacy text object with a null payload without crashing', async () => {
    const legacy = {
      id: 11,
      object_id: 'legacy_text',
      name: 'Legacy Text',
      object_type: 'text',
      payload: null,
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([legacy])));

    render(<ReplyObjectsPage />);
    await screen.findByText('Legacy Text');

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));

    expect((screen.getByLabelText('Universal ID *') as HTMLInputElement).value).toBe('legacy_text');
    // Null payload degrades to the empty-object skeleton in the raw editor.
    expect((screen.getByPlaceholderText('{ ... }') as HTMLTextAreaElement).value).toBe('{}');
  });

  it('loads a legacy flex payload (no quickReply / editor fields) untouched into the raw editor', async () => {
    const legacy = {
      id: 12,
      object_id: 'legacy_flex',
      name: 'Legacy Flex',
      object_type: 'flex',
      payload: {
        type: 'bubble',
        body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'เก่าแต่เก๋า' }] },
      },
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([legacy])));

    render(<ReplyObjectsPage />);
    await screen.findByText('Legacy Flex');

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));

    const textarea = screen.getByPlaceholderText('{ ... }') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"type": "bubble"');
    // A flex payload has no editor-managed lists, so no internal keys are injected.
    expect(textarea.value).not.toContain('_key');
    // Live preview renders the legacy bubble.
    expect(screen.getByTestId('flex-bubble')).toBeInTheDocument();
    expect(screen.getByText('เก่าแต่เก๋า')).toBeInTheDocument();
  });

  it('opens a legacy template payload (created before the structured editors) in the form editor', async () => {
    const legacy = {
      id: 13,
      object_id: 'legacy_confirm',
      name: 'Legacy Confirm',
      object_type: 'template',
      payload: {
        template: {
          type: 'confirm',
          text: 'ยืนยันหรือไม่',
          actions: [
            { type: 'message', label: 'ใช่', text: 'ใช่' },
            { type: 'message', label: 'ไม่', text: 'ไม่' },
          ],
        },
      },
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([legacy])));

    render(<ReplyObjectsPage />);
    await screen.findByText('Legacy Confirm');

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));

    // Structured editor opens on the confirm subtype with the legacy text intact.
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute('aria-pressed', 'true');
    expect((screen.getByPlaceholderText('คำถามให้ผู้ใช้ยืนยัน') as HTMLTextAreaElement).value).toBe(
      'ยืนยันหรือไม่',
    );
  });
});
