import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
import '@/i18n';
import { vi } from 'vitest';

Object.defineProperty(window, 'open', {
    configurable: true,
    writable: true,
    value: vi.fn(() => null),
});
