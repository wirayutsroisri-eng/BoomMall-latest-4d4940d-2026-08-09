import Link from 'next/link';
import { shopWebPath } from '@/lib/canonical';

/**
 * There is no public "browse all shops/products" backend endpoint yet
 * (only per-shop reads exist — see backend/src/modules/shop/http/routes.ts).
 * Until that lands, this landing page is a shop lookup rather than a feed.
 */
export default function HomePage() {
  return (
    <main className="container">
      <h1>BoomMall</h1>
      <p>เข้าดูหน้าร้านค้าโดยใส่ชื่อร้าน (handle) หรือรหัสร้าน</p>
      <form action="/shop-redirect" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          name="shopKey"
          placeholder="เช่น @myshop"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }}
        />
        <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#111', color: '#fff' }}>
          ไปที่ร้าน
        </button>
      </form>
      <p style={{ marginTop: 24, fontSize: 13, color: '#666' }}>
        ตัวอย่าง: <Link href={shopWebPath('myshop')}>{shopWebPath('myshop')}</Link>
      </p>
    </main>
  );
}
