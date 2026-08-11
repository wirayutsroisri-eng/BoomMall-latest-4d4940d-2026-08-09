import { useEffect, useState } from 'react';
import { fetchHandbookAccess } from '../lib/api';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Callout, HandbookSection, KeyValue } from './handbook/HandbookSection';

const TOC = [
  { id: 'concept', label: '1. แนวคิดและจุดกำเนิด' },
  { id: 'flywheel', label: '2. วงจรเศรษฐกิจ' },
  { id: 'use-cases', label: '3. บริบทและรูปแบบการใช้งาน' },
  { id: 'supply', label: '4. การบริหาร Supply & Top-up' },
  { id: 'security', label: '5. ความปลอดภัยและ Ledger' },
] as const;

export function HandbookPage() {
  const { isAdmin, session } = useAdminAuth();
  const [denied, setDenied] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      setChecking(true);
      try {
        if (!isAdmin) {
          setDenied('ต้องเป็นบัญชี ADMIN');
          return;
        }
        await fetchHandbookAccess();
        setDenied(null);
      } catch (e) {
        setDenied(e instanceof Error ? e.message : 'ไม่มีสิทธิ์เข้าคู่มือ');
      } finally {
        setChecking(false);
      }
    })();
  }, [isAdmin]);

  function onPrint() {
    window.print();
  }

  if (checking) {
    return (
      <div className="rounded-2xl border border-[#122820]/10 bg-white/70 px-4 py-8 text-center text-sm text-[#122820]/70">
        กำลังตรวจสอบสิทธิ์เข้าคู่มือ…
      </div>
    );
  }

  if (denied) {
    return (
      <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-6 text-rose-800">
        <p className="font-bold">เข้าถึงคู่มือไม่ได้</p>
        <p className="mt-1 text-sm">{denied}</p>
        <p className="mt-2 text-sm opacity-80">หน้านี้จำกัดเฉพาะบัญชี ADMIN เท่านั้น</p>
      </div>
    );
  }

  return (
    <div className="handbook-root">
      {/* Screen toolbar */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#0b1f17]">
            คู่มือระบบ Boom Coin
          </h2>
          <p className="text-sm text-[#122820]/65">
            Handbook สำหรับทีมภายใน · ผู้เข้าถึง: {session?.actor} (ADMIN)
          </p>
        </div>
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-xl bg-[#122820] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#0b1f17]"
        >
          🖨️ พิมพ์คู่มือ (Print PDF)
        </button>
      </div>

      {/* Print cover */}
      <div className="mb-8 hidden print:mb-10 print:block">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-black/50">
          BoomMall Internal · Confidential
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">
          คู่มือระบบ Boom Coin (Handbook)
        </h1>
        <p className="mt-2 text-sm text-black/70">
          Closed-Loop Utility · Double-Entry Ledger · On-Premise Ops
        </p>
        <p className="mt-4 text-xs text-black/50">
          พิมพ์เมื่อ {new Date().toLocaleString('th-TH')} · โดย {session?.actor}
        </p>
      </div>

      {/* TOC */}
      <nav className="no-print mb-8 rounded-2xl border border-[#122820]/10 bg-white/70 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-[#122820]/55">
          สารบัญ
        </p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {TOC.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="block rounded-lg px-3 py-2 text-sm font-semibold text-[#0b7a52] hover:bg-[#00d68f]/10"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-8 print:space-y-6">
        {/* 1 */}
        <HandbookSection
          id="concept"
          number="01"
          title="แนวคิดและจุดกำเนิด"
          subtitle="Core Concept & Closed-Loop Economy"
        >
          <p>
            <strong>Boom Coin (🪙)</strong> คือ utility asset ชนิดเดียวของ BoomMall
            ที่ออกแบบเป็นระบบเศรษฐกิจปิด (Closed-Loop) ภายในแพลตฟอร์มเท่านั้น
            ไม่ใช่คริปโตที่ถอนออกนอกระบบ และไม่ใช่โทเคนบน public chain
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <KeyValue label="หน่วยมูลค่า" value="1 Boom Coin = สิทธิใช้จ่าย 1 บาท ใน BoomMall" />
            <KeyValue label="ชนิดข้อมูล" value="Integer เท่านั้น — ห้าม Float" />
            <KeyValue label="เครือข่าย" value="INTERNAL · CLOSED_LOOP_UTILITY" />
          </div>
          <Callout title="จุดกำเนิด (Why Boom Coin)">
            ต้องการสื่อกลางเดียวที่เชื่อม Social (สนับสนุนคอนเทนต์) · Commerce (ซื้อ/ส่วนลด) ·
            Seller / Affiliate / Warehouse / Ads ให้ไหลเวียนในวงจรเดียวกัน โดยบริษัทควบคุม
            Supply และความถูกต้องของ Ledger ได้แบบ on-premise
          </Callout>
          <Callout title="สิ่งที่ห้ามใน V1" tone="warn">
            <ul className="list-disc space-y-1 pl-5">
              <li>โอนออกนอก BoomMall / Withdrawal เป็นเงินสดโดยตรงจาก User Wallet</li>
              <li>แก้ยอด Wallet จาก Admin UI โดยไม่ผ่าน Ledger</li>
              <li>ใช้ทศนิยมของ Coin (ต้องเป็นจำนวนเต็มเสมอ)</li>
            </ul>
          </Callout>
        </HandbookSection>

        {/* 2 */}
        <HandbookSection
          id="flywheel"
          number="02"
          title="วงจรเศรษฐกิจ"
          subtitle="Economic Flywheel"
        >
          <p>
            Boom Coin ถูกออกแบบให้หมุนเป็นวงล้อ (Flywheel) — ยิ่งมีการใช้งานในแพลตฟอร์ม
            ยิ่งดึงดูด Creator / Seller / User ให้เข้าร่วม และนำ Coin กลับเข้าสู่กิจกรรมใหม่
          </p>
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <strong>Treasury Seed</strong> — ระบบเริ่มต้นด้วยการ Mint เข้าคลังกลาง
              (Platform Treasury) เพื่อเป็นแหล่ง Reward / สภาพคล่องภายใน
            </li>
            <li>
              <strong>User Earn & Spend</strong> — ผู้ใช้ได้ Coin จาก Reward / สนับสนุน
              และใช้จ่ายใน Social หรือ Commerce
            </li>
            <li>
              <strong>Creator & Community Receive</strong> — Coin ไหลไปยังครีเอเตอร์และชุมชน
              กระตุ้นการสร้างคอนเทนต์และ engagement
            </li>
            <li>
              <strong>Seller Circulate</strong> — ร้านค้าเติม Coin (ผ่านบาทจริง + Admin Approve)
              เพื่อโปรโมท / ส่วนลด / ค่าบริการในระบบ แล้ว Coin หมุนกลับเข้า User & Platform
            </li>
            <li>
              <strong>Reconcile & Trust</strong> — ทุกการเคลื่อนไหวผ่าน Double-Entry Ledger
              ทำให้ Total Supply ตรวจสอบได้ตลอดเวลา → ความเชื่อถือของระบบ
            </li>
          </ol>
          <Callout title="ภาพรวม Flywheel" tone="ink">
            Treasury → Reward/User → Social/Commerce Spend → Creator/Seller →
            (Seller Top-up Mint) → Treasury & Circulating เพิ่มขึ้นอย่างมีแบบแผน →
            Reconcile OK
          </Callout>
        </HandbookSection>

        {/* 3 */}
        <HandbookSection
          id="use-cases"
          number="03"
          title="บริบทและรูปแบบการใช้งาน"
          subtitle="Social · Commerce · Seller GP · Affiliate · Boom Tree"
        >
          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">Social</h3>
          <p>
            ใช้ Boom Coin สนับสนุนโพสต์ วิดีโอ ไลฟ์ และคอมเมนต์ (Content / Live / Comment Support)
            แทนระบบไลก์แบบไม่มีมูลค่า — ยอดที่ครีเอเตอร์ได้รับสะสมเป็น Lifetime Coins (สถานะโซเชียล)
            ในขณะที่ยอด Wallet จริงเป็นข้อมูลส่วนตัวของเจ้าของบัญชี
          </p>

          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">Commerce</h3>
          <p>
            จ่ายค่าสินค้า ส่วนลดสินค้า ค่าจัดส่ง และบริการในแอปด้วย Coin
            (Product Payment / Discount / Shipping) ภายใต้สิทธิ 1 Coin = 1 บาทใน BoomMall
          </p>

          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">
            Seller GP (Gross Profit / Seller Ops)
          </h3>
          <p>
            ร้านค้าใช้ Coin สำหรับโปรโมชัน ค่าโฆษณาในแพลตฟอร์ม และค่าบริการที่เกี่ยวข้อง
            โดยเติมสภาพคล่องผ่านการโอนเงินบาทเข้าบัญชีบริษัท แล้วรอ Admin อนุมัติสลิปเพื่อ Mint Coin
            เข้า Seller Wallet — ไม่มีทางลัดแก้ยอด
          </p>

          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">Affiliate</h3>
          <p>
            ค่าคอมมิชชันพันธมิตร / คลังร่วม (Affiliate / Warehouse Commission)
            จ่ายเป็น Boom Coin ผ่าน Ledger ทำให้ตรวจสอบที่มาของรายได้ในระบบได้ครบวงจร
          </p>

          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">
            Boom Tree 🌱
          </h3>
          <p>
            Boom Tree คือ <strong>Visual Reward System</strong> ไม่ใช่กระเป๋าเงินแยก และไม่ใช่ดอกเบี้ย
            ทำหน้าที่สร้างแรงจูงใจและแสดงความคืบหน้าของรางวัล
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <KeyValue label="Seedling" value="🌱 เริ่มต้น" />
            <KeyValue label="Growing" value="🌿 กำลังเติบโต" />
            <KeyValue label="Ready" value="🌳 พร้อม" />
            <KeyValue label="Coin Ready" value="🌳🪙 พร้อมเคลม" />
          </div>
          <Callout title="กฎสำคัญของ Boom Tree" tone="warn">
            การ Claim ต้องผ่าน Reward Engine → Ledger เท่านั้น แอนิเมชันบน UI
            <strong> ห้ามสร้าง / Mint Coin เอง</strong>
          </Callout>
        </HandbookSection>

        {/* 4 */}
        <HandbookSection
          id="supply"
          number="04"
          title="การบริหาร Supply และการอนุมัติเติมเงิน Seller"
          subtitle="100,000 Coins · Seller Top-up · Revenue THB"
        >
          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">
            Initial Supply
          </h3>
          <p>
            เมื่อบูตระบบครั้งแรก จะ <strong>Mint 100,000 Boom Coin</strong> เข้า
            <code className="mx-1 rounded bg-[#e8f2ec] px-1.5 py-0.5 text-[13px]">
              PLATFORM_TREASURY
            </code>
            นี่คือจุดตั้งต้นของ Total Minted Supply
          </p>

          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">
            Seller Top-up (เติมเงินบาท → Mint Coin)
          </h3>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Seller โอนเงินบาทเข้าบัญชีบริษัท และแนบสลิป (Proof of Payment)</li>
            <li>คำขอเข้าสถานะ PENDING ใน Admin Dashboard</li>
            <li>
              Admin ตรวจสลิป แล้วกด <strong>Approve / อนุมัติ</strong>
            </li>
            <li>
              ระบบ Mint Coin ตามยอดจริงอัตราส่วน <strong>1 THB = 1 Coin</strong> เข้า Seller Wallet
              ผ่าน Double-Entry (ห้ามแก้ยอดตรง)
            </li>
            <li>
              Total Minted Supply และ Total Company Revenue (THB) เพิ่มขึ้นอัตโนมัติ
            </li>
          </ol>

          <Callout title="Invariant ของ Supply" tone="mint">
            <code className="text-[13px]">
              User + Seller + Treasury + Pools === SystemSupply.totalMinted
            </code>
            <br />
            ตรวจได้ที่ <code className="text-[13px]">GET /api/v1/ledger/reconcile</code>
          </Callout>

          <Callout title="Idempotency" tone="ink">
            การ Approve ต้องส่ง <code className="text-[13px]">Idempotency-Key</code>{' '}
            ทุกครั้ง เพื่อป้องกันการ Mint ซ้ำจากการดับเบิลคลิกหรือรีทรายเครือข่าย
          </Callout>
        </HandbookSection>

        {/* 5 */}
        <HandbookSection
          id="security"
          number="05"
          title="โครงสร้างความปลอดภัยและระบบ Ledger หลังบ้าน"
          subtitle="Double-Entry · On-Prem · ADMIN-only"
        >
          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">
            Double-Entry Ledger
          </h3>
          <p>
            ทุกธุรกรรมถูกบันทึกเป็นคู่บัญชี (DEBIT / CREDIT) ในตาราง{' '}
            <code className="rounded bg-[#e8f2ec] px-1.5 py-0.5 text-[13px]">
              wallet_transactions
            </code>{' '}
            +{' '}
            <code className="rounded bg-[#e8f2ec] px-1.5 py-0.5 text-[13px]">ledger_entries</code>
            ยอด Wallet เป็นเพียง Projection ที่อัปเดตภายในทรานแซกชันของ Ledger เท่านั้น
          </p>
          <p>
            การ Mint: <strong>DEBIT</strong> บัญชี SYSTEM_MINT (contra) ·{' '}
            <strong>CREDIT</strong> ปลายทาง (Treasury / Seller) · เพิ่ม{' '}
            <code className="text-[13px]">totalMinted</code>
          </p>

          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">
            On-Premise Security
          </h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>PostgreSQL อยู่บน Docker internal network — ไม่เปิดพอร์ต DB สาธารณะ</li>
            <li>เชื่อมต่อ API ↔ DB ด้วย TLS (<code className="text-[13px]">sslmode=require</code>)</li>
            <li>Backup รายวันเก็บบนดิสก์เซิร์ฟเวอร์บริษัท (<code className="text-[13px]">backup.sh</code>)</li>
            <li>Admin Portal ใช้ Bearer Admin API Key · คู่มือนี้ตรวจ role = ADMIN ซ้ำที่ API</li>
          </ul>

          <h3 className="font-display text-lg font-extrabold text-[#0b1f17]">
            สิ่งที่ Admin ทำได้ / ไม่ได้
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Callout title="ทำได้" tone="mint">
              ดูสถิติ Supply · ตรวจสลิป · Approve Top-up · Reconcile · อ่านคู่มือ · พิมพ์ Handbook
            </Callout>
            <Callout title="ทำไม่ได้" tone="warn">
              กดแก้ยอด Wallet ตรง ๆ · Mint โดยไม่ผ่าน Approve/Ledger · เข้าคู่มือโดยไม่มีสิทธิ์ ADMIN
            </Callout>
          </div>

          <p className="pt-2 text-xs text-[#122820]/50 print:text-black/50">
            เอกสารฉบับนี้เป็นข้อมูลภายใน BoomMall — ห้ามเผยแพร่ภายนอกโดยไม่ได้รับอนุญาต
          </p>
        </HandbookSection>
      </div>

      <div className="no-print mt-8 flex justify-end">
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-xl border border-[#122820]/15 bg-white px-4 py-2.5 text-sm font-bold text-[#122820] hover:bg-[#e8f2ec]"
        >
          🖨️ พิมพ์คู่มือ (Print PDF)
        </button>
      </div>
    </div>
  );
}
