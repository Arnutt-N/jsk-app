/**
 * Password strength scoring shared across admin user-management pages.
 *
 * Returns a 0-4 level plus a Thai label and Tailwind bar color:
 *   1 = อ่อน (red), 2 = ปานกลาง (amber), 3 = ดี (blue), 4 = แข็งแรง (green)
 */
export interface PasswordStrength {
    level: number;
    label: string;
    color: string;
}

export function passwordStrength(pw: string): PasswordStrength {
    if (!pw) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 1) return { level: 1, label: 'อ่อน', color: 'bg-red-500' };
    if (score <= 2) return { level: 2, label: 'ปานกลาง', color: 'bg-amber-500' };
    if (score <= 3) return { level: 3, label: 'ดี', color: 'bg-blue-500' };
    return { level: 4, label: 'แข็งแรง', color: 'bg-green-500' };
}
