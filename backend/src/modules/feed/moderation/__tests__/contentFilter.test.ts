import { describe, expect, it } from 'vitest';
import { screenText } from '../contentFilter';

describe('pre-publish content filter', () => {
  it('lets ordinary posts through', () => {
    expect(screenText('ทุเรียนหมอนทองจันทบุรี ตัดสดทุกวัน สนใจทักแชท').action).toBe('allow');
    expect(screenText('').action).toBe('allow');
    expect(screenText('เช็คราคาที่ https://boommall.app/shop/1').action).toBe('allow');
  });

  it('blocks content that can never be allowed', () => {
    expect(screenText('รับขายบริการ นัดได้').reason).toBe('sexual_service');
    expect(screenText('ขายยาบ้า ส่งด่วน').reason).toBe('drugs');
    expect(screenText('เว็บพนันบาคาร่าแตกง่าย').reason).toBe('gambling');
    expect(screenText('ขายยาบ้า ส่งด่วน').action).toBe('block');
  });

  it('blocks link farms', () => {
    const spam = 'ดูที่นี่ https://a.com https://b.com https://c.com https://d.com';
    expect(screenText(spam).reason).toBe('contact_spam');
  });

  it('flags rather than blocks the grey area', () => {
    const verdict = screenText('เครียดมาก อยากตาย');
    expect(verdict.action).toBe('flag');
    expect(verdict.reason).toBe('self_harm');
  });

  it('explains what to do when it blocks', () => {
    expect(screenText('ขายปืนสั้น').message).toContain('support@boommall.app');
  });
});
