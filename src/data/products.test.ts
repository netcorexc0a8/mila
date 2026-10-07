import { describe, expect, it } from 'vitest';
import { productInfo } from './products';
import { RECALLED_PRODUCTS } from './recall';

describe('productInfo', () => {
  it('has a display title and description for every recalled product', () => {
    for (const p of RECALLED_PRODUCTS) {
      const info = productInfo(p);
      expect(info.title).not.toBe(p.name.toUpperCase() === p.name && info.brand === '' ? p.name : '');
      expect(info.brand).not.toBe('');
      expect(info.description).toContain(p.weight);
    }
  });
});
