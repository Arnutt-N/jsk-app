import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BE_OFFSET = 543;

export function toCE(beYear: number): number {
  return beYear - BE_OFFSET;
}

export function toBE(ceYear: number): number {
  return ceYear + BE_OFFSET;
}

export function parseThaiDate(day: number, month: number, beYear: number): Date {
  return new Date(toCE(beYear), month - 1, day);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
