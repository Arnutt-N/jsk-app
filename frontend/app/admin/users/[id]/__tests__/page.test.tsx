// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserDetailPage from '../page';

const { mockPush, mockSearchParams } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSearchParams: { get: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '2' }),
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

const authState = { role: 'SUPER_ADMIN' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', role: authState.role } }),
}));

const user = {
  id: 2,
  username: 'agent2',
  email: 'agent2@example.com',
  display_name: 'Agent Two',
  picture_url: null,
  role: 'AGENT',
  is_active: true,
  line_user_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('UserDetailPage mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'SUPER_ADMIN';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => user,
    }));
  });

  it('renders a read-only detail page without query mode', async () => {
    mockSearchParams.get.mockReturnValue(null);
    render(<UserDetailPage />);

    expect(await screen.findByText('Agent Two')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'แก้ไขข้อมูล' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'บันทึก' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ข้อมูลบัญชี' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' })).toBeInTheDocument();
  });

  it('renders the editable form when mode=edit', async () => {
    mockSearchParams.get.mockReturnValue('edit');
    render(<UserDetailPage />);

    expect(await screen.findByRole('heading', { name: 'แก้ไขข้อมูล' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'เปลี่ยนรหัสผ่าน' })).toBeInTheDocument();
  });

  it('offers VIEWER when the caller is SUPER_ADMIN', async () => {
    mockSearchParams.get.mockReturnValue('edit');
    render(<UserDetailPage />);
    await screen.findByRole('heading', { name: 'แก้ไขข้อมูล' });

    const options = screen.getAllByRole('combobox').map((el) =>
      Array.from((el as HTMLSelectElement).options).map((o) => o.value));
    expect(options.some((list) => list.includes('VIEWER'))).toBe(true);
  });

  it('hides VIEWER from ADMIN and disables roles ADMIN cannot assign', async () => {
    authState.role = 'ADMIN';
    mockSearchParams.get.mockReturnValue('edit');
    render(<UserDetailPage />);
    await screen.findByRole('heading', { name: 'แก้ไขข้อมูล' });

    const roleSelect = screen.getAllByRole('combobox').find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'AGENT')) as HTMLSelectElement;
    const options = Array.from(roleSelect.options);
    expect(options.some((o) => o.value === 'VIEWER')).toBe(false);
    expect(options.find((o) => o.value === 'AGENT')?.disabled).toBe(false);
  });
});
