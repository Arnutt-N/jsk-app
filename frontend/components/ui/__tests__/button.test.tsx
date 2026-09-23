import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Button, buttonVariants } from '../Button';

it('default renders primary variant', () => {
  render(<Button>ตกลง</Button>);
  const btn = screen.getByRole("button", { name: "ตกลง" });
  expect(btn.className).toMatch(/from-brand-500/);
});

it("danger variant uses danger token, not hardcoded color", () => {
  render(<Button variant="danger">ลบ</Button>);
  const btn = screen.getByRole("button", { name: "ลบ" });
  expect(btn.className).toMatch(/from-danger/);
  expect(buttonVariants({ variant: "danger" })).not.toMatch(/#[0-9a-fA-F]{3,6}/);
});
