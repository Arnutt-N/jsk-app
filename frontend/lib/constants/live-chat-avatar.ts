/**
 * Avatar fallback constants สำหรับ live-chat
 * @description Brand blue (brand-500 ~ #3b82f6). Avatar fallbacks previously hardcoded indigo
 * #6366f1 which does not match the brand; unified to one value (L2).
 */

// Brand blue (brand-500 ~ #3b82f6)
export const AVATAR_FALLBACK_BG = '3b82f6';
export const AVATAR_FALLBACK_FG = 'fff';

/**
 * สร้าง URL avatar fallback จาก ui-avatars.com ด้วยสีแบรนด์มาตรฐาน
 * @param displayName - ชื่อที่จะแสดงบน avatar
 * @param size - ขนาด avatar เป็น pixel (default 40)
 * @returns URL สำหรับ avatar fallback
 */
export function getAvatarFallbackUrl(displayName: string, size = 40): string {
  const name = encodeURIComponent(displayName ?? '');
  return `https://ui-avatars.com/api/?name=${name}&background=${AVATAR_FALLBACK_BG}&color=${AVATAR_FALLBACK_FG}&size=${size}`;
}
