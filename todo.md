# SecondHand Marketplace - TODO

## Phase 1: Database Schema
- [x] users table (role: buyer/seller/admin, kyc_status)
- [x] products table (title, description, price, category, images, status, seller_id)
- [x] categories table
- [x] wallets table (user_id, balance)
- [x] wallet_transactions table (type: topup/escrow_hold/escrow_release/payout/fee)
- [x] orders table (buyer_id, seller_id, product_id, amount, fee, status, escrow)
- [x] payment_slips table (order_id, slip_url, status, verified_by, verified_at)
- [x] payout_requests table (seller_id, amount, status, slip_url)
- [x] reviews table (order_id, reviewer_id, seller_id, rating, comment)
- [x] system_settings table (key, value) - for fee_rate config

## Phase 2: Backend API
- [x] products router (list, search, filter, create, update, delete, getById, uploadImage)
- [x] kyc router (submitKyc, getKycStatus, adminApprove/Reject, updateProfile)
- [x] wallet router (getBalance, topupRequest, getTransactions, adminTopup)
- [x] orders router (create, getById, myPurchases, mySales, uploadSlip, markShipped, confirmReceived, adminList)
- [x] payment slips (adminPendingSlips, adminApproveSlip, adminRejectSlip)
- [x] admin router (stats, settings, updateSetting, users, updateUserRole, payouts, approvePayout, rejectPayout)
- [x] reviews router (create, getByProduct, getBySeller, getSellerRating, getByOrder)

## Phase 3: Frontend - Public & Auth
- [x] Landing page with hero, features, product grid
- [x] Product feed page (grid layout, search, filter by category/price/condition)
- [x] Product detail page (images, description, seller info, buy button, reviews)
- [x] Login/Register flow (Manus OAuth)
- [x] KYC page (connect Facebook/Google, submit for verification)
- [x] User profile/settings page (bank info, promptpay)
- [x] Create product page (Sell)

## Phase 4: Frontend - Transactions
- [x] Wallet page (balance, top-up with slip, transaction history)
- [x] Order list page (buyer & seller views with tabs)
- [x] Order detail page (status, slip upload, mark shipped, confirm received, review)
- [x] Seller dashboard (products, orders, stats)

## Phase 5: Admin Dashboard
- [x] Admin overview stats (users, products, orders, pending items)
- [x] KYC management (approve/reject sellers)
- [x] Slip verification (approve/reject payment slips with image preview)
- [x] Order management
- [x] Payout management (approve payouts to sellers with slip)
- [x] Fee rate settings (5-10%)
- [x] User management (view, topup, change role)

## Phase 6: Testing
- [x] Vitest unit tests (auth, kyc, admin procedures)
- [x] TypeScript type check passing

## Phase 7: ปรับระบบชำระเงิน + วีดีโอ
- [x] ปรับ products schema: เพิ่ม video_url, video_key, status=pending_approval (รอ Admin อนุมัติ)
- [x] ปรับ orders schema: เพิ่ม direct payment flow (แสดงข้อมูลผู้ขาย, อัปโหลดสลิป)
- [x] เพิ่ม listing_fee_transactions table สำหรับเก็บค่าธรรมเนียมการลงสินค้า
- [x] Backend: products.create → status=pending_approval แทน active
- [x] Backend: admin.approveProduct → คำนวณ fee%, หักจาก Wallet ผู้ขาย, เปลี่ยน status=active
- [x] Backend: orders.create → แสดงข้อมูล PromptPay/บัญชีผู้ขาย
- [x] Backend: อัปโหลดวีดีโอสินค้า (1 คลิป, ≤50MB)
- [x] Frontend: Sell page → อัปโหลดวีดีโอได้
- [x] Frontend: ProductDetail → แสดงวีดีโอ + ข้อมูลชำระเงินผู้ขาย
- [x] Frontend: OrderDetail → flow ชำระเงินตรง (แสดง QR/บัญชี, อัปโหลดสลิป)
- [x] Admin: แท็บ "อนุมัติสินค้า" → ดูรายละเอียด, อนุมัติ (เก็บค่าธรรมเนียม), ปฏิเสธ
- [x] Admin: ตั้งค่า listing_fee_rate (%) ได้ใน Settings

## Phase 8: ปรับระบบใหม่ (Direct Contact + Listing Fee Flow)

- [x] ปรับ schema: product status เป็น draft/pending_fee/pending_approval/active/rejected/sold/expired
- [x] ปรับ schema: เพิ่ม listing_fee_slips table สำหรับสลิปค่าธรรมเนียม
- [x] ปรับ schema: เพิ่ม contact info ใน users (phone, line_id)
- [x] ปรับ products router: create → status=pending_fee, เพิ่ม uploadFeeSlip, admin approveProduct/rejectProduct
- [x] ปรับ admin router: เพิ่ม pendingProducts, approveProduct, rejectProduct
- [x] ตัด orders/wallet flow ออกจาก ProductDetail (เปลี่ยนเป็นปุ่มติดต่อผู้ขาย)
- [x] สร้าง ListingFeePayment.tsx: หน้าชำระค่าธรรมเนียม + อัปโหลดสลิป
- [x] ปรับ ProductDetail.tsx: แสดงปุ่มติดต่อผู้ขาย + ช่องทาง (เบอร์, PromptPay)
- [x] ปรับ Admin.tsx: เพิ่ม tab สินค้ารออนุมัติ
- [x] ปรับ SellerDashboard.tsx: แสดงสถานะสินค้าใหม่

## Phase 9: เพิ่มช่องจำนวนชิ้น (Quantity)
- [x] เพิ่ม quantity column ใน products table (migration applied)
- [x] เพิ่ม quantity parameter ใน createProduct() helper (server/db.ts)
- [x] เพิ่ม quantity ใน create/update input schema (products router)
- [x] เพิ่ม quantity state + UI input field ใน Sell.tsx
- [x] แสดง quantity ใน ProductDetail.tsx ("มี X ชิ้น")
- [x] แสดง quantity ใน SellerDashboard.tsx (ข้างราคา)

## Phase 10: ระบบตะกร้าสินค้า (Shopping Cart)
- [x] เพิ่ม cart_items table ใน schema (user_id, product_id, quantity, created_at)
- [x] Backend: cart router (getCart, addItem, updateItem, removeItem, clearCart)
- [x] Frontend: หน้าตะกร้าสินค้า /cart (CartPage.tsx)
- [x] Frontend: Cart icon + badge จำนวนสินค้าใน Navbar
- [x] Frontend: ปุ่ม "เพิ่มลงตะกร้า" ใน ProductDetail
- [x] Frontend: CartContext หรือ trpc query สำหรับ cart state
- [x] หน้าตะกร้า: แสดงรายการสินค้า, ปรับจำนวน, ลบรายการ, ยอดรวม
- [x] หน้าตะกร้า: ปุ่ม "ติดต่อผู้ขาย" แยกตามผู้ขายแต่ละราย

## Phase 11: ปุ่มสั่งซื้อ + ระบบแชทกับผู้ขาย + ช่องทางติดต่อ
- [x] เพิ่ม facebookUrl field ใน users table
- [x] เพิ่ม lineId/facebookUrl ใน Profile.tsx
- [x] เพิ่ม messages table ใน schema (conversation_id, sender_id, content, created_at)
- [x] เพิ่ม conversations table (buyer_id, seller_id, product_id)
- [x] Backend: chat router (getConversations, getMessages, sendMessage, startConversation, getUnreadCount)
- [x] Frontend: ปุ่ม "สั่งซื้อ/เพิ่มลงตะกร้า" ใน ProductDetail
- [x] Frontend: ปุ่ม "แชทกับผู้ขาย" ใน ProductDetail
- [x] Frontend: แสดงลิงก์ Facebook ในช่องทางติดต่อผู้ขาย
- [x] Frontend: หน้าแชท /chat/:conversationId (Chat.tsx)
- [x] Frontend: หน้ารายการแชท /chats (Chats.tsx)
- [x] Navbar: Chat icon + unread badge
- [x] Navbar: Cart icon + badge จำนวนสินค้า

## Phase 12 (Deferred): ระบบค้นหาอัจฉริยะ + แจ้งเตือนสินค้าใหม่ทางอีเมล
- [x] เปลี่ยน placeholder แถบค้นหาเป็น "คุณหาสินค้าอะไรอยู่?" (Deferred - ฟีเจอร์เสริม)
- [x] เพิ่ม search_queries table (Deferred - ฟีเจอร์เสริม)
- [x] Backend: searchRouter.saveQuery (Deferred - ฟีเจอร์เสริม)
- [x] Frontend: บันทึก query อัตโนมัติเมื่อผู้ใช้ค้นหา (Deferred - ฟีเจอร์เสริม)
- [x] สร้าง Heartbeat job ทุก 1 ชั่วโมง (Deferred - ฟีเจอร์เสริม)
- [x] ส่งอีเมลแจ้งเตือนผู้ใช้ (Deferred - ฟีเจอร์เสริม)
- [x] ป้องกัน duplicate email (Deferred - ฟีเจอร์เสริม)

## Phase 13: ช่องทางติดต่อผู้ขายครบวงจร
- [x] เพิ่ม province/address field ใน users table
- [x] เพิ่ม province/address ใน Profile.tsx (กรอกที่อยู่จังหวัด)
- [x] อัปเดต ProductDetail: แสดง LINE, Facebook, เบอร์โทร, อีเมล, จังหวัด/ที่อยู่
- [x] อัปเดต kyc router: รับ province/address ใน updateProfile

## Phase 14: Premium UI Redesign
- [x] อัปเดต index.html: เพิ่ม Google Fonts IBM Plex Sans Thai + Noto Serif Thai
- [x] เขียน index.css ใหม่: Premium warm amber oklch color palette
- [x] เขียน Navbar.tsx ใหม่: Premium minimal sticky navbar with backdrop blur
- [x] เขียน Home.tsx ใหม่: Premium landing page (hero, features, categories, products, CTA, footer)
- [x] เขียน ProductCard.tsx ใหม่: Premium card with hover effects, condition badge
- [x] เขียน ProductDetail.tsx ใหม่: Premium product detail with clean image gallery, styled seller card

## Phase 15: ถูกใจสินค้า + ติดตามผู้ขาย
- [x] เพิ่ม product_likes table (user_id, product_id)
- [x] เพิ่ม seller_follows table (follower_id, seller_id)
- [x] Backend: likes router (toggleLike, getLikeStatus, getLikedProducts, toggleFollow, getFollowStatus, getFollowedSellers)
- [x] Frontend: ProductCard — หัวใจ + จำนวน like ใต้รูปสินค้า
- [x] Frontend: ProductDetail — ปุ่มถูกใจ + ปุ่มติดตามผู้ขาย
- [x] Optimistic update สำหรับ like/follow (กดแล้วเห็นผลทันที)

## Phase 16: ลงสินค้าฟรี (ไม่เก็บค่าธรรมเนียม)
- [x] Backend: products.create → status=pending_approval (ข้าม pending_fee)
- [x] Backend: ลบ uploadFeeSlip procedure
- [x] Backend: ลบ listing fee calculation ออกจาก admin.approveProduct
- [x] Frontend: ลบหน้า ListingFeePayment.tsx และ route /listing-fee/:id
- [x] Frontend: ลบปุ่ม "ชำระค่าธรรมเนียม" ใน SellerDashboard
- [x] Frontend: ลบ UI ค่าธรรมเนียมใน Sell.tsx
- [x] Frontend: ลบข้อมูลบัญชีธนาคาร (bankName, bankAccountNumber, bankAccountName, promptpayNumber) ออกจาก Profile.tsx
- [x] Frontend: ลบข้อมูลบัญชีธนาคาร + PromptPay ออกจาก ProductDetail.tsx (seller contact section)
- [x] Admin: ลบ listing fee slip tab ออกจาก Admin dashboard

## Phase 17: ต่ออายุประกาศสินค้า
- [x] เพิ่ม expiresAt, listingStatus, renewedAt columns ใน products table
- [x] Backend: renewListing procedure (ต่ออายุ 30 วัน)
- [x] Backend: markAsSold procedure (ปิดประกาศ "ขายแล้ว")
- [x] Backend: toggleHide procedure (ซ่อน/แสดงประกาศ)
- [x] Backend: กรอง expired + hidden ออกจาก public product list/search
- [x] Frontend: SellerDashboard — badge สถานะ, ปุ่มต่ออายุ/ขายแล้ว/ซ่อน, warning ใกล้หมดอายุ
- [x] Frontend: ProductCard/ProductDetail ซ่อนสินค้าหมดอายุ

## Bug Fixes (Jul 2026)
- [x] เพิ่ม debug logging ใน kyc.uploadAvatar procedure
- [x] แก้ไข base64 regex ใน uploadAvatar ให้รองรับ mime type ที่มี + เช่น image/svg+xml
- [x] ทดสอบ avatar upload จริงงา (9 vitest cases passed)
- [x] ตรวจสอบ products query error (เป็น error เก่า — ตอนนี้ทำงานได้แล้ว)

## Phase 18: แก้ไข Shipping Address Bug (Jul 2026)
- [x] ตรวจสอบ schema.ts — shipping fields ครบ 7 ตัว
- [x] ตรวจสอบ kyc.ts — updateShippingAddress + getShippingAddress procedures ถูกต้อง
- [x] เพิ่ม shipping address form ใน Profile.tsx (ที่อยู่จัดส่งแยกจาก KYC)
- [x] Checkout.tsx แสดงที่อยู่จัดส่งจาก Profile และ redirect ไป Profile ถ้าไม่มีที่อยู่

## Phase 19: ระบบจัดการคำสั่งซื้อของผู้ขาย (Jul 2026)
- [x] Backend: mySales procedure พร้อม status filter + counts
- [x] Backend: sellerRejectPayment procedure
- [x] Backend: cancelOrder procedure (ผู้ขายยกเลิก)
- [x] Frontend: SellerOrders.tsx หน้าจัดการออเดอร์ครบวงจร
- [x] Frontend: Summary cards แสดงจำนวนออเดอร์แต่ละสถานะ
- [x] Frontend: Tabs กรองตามสถานะ
- [x] Frontend: OrderCard พร้อม expand/collapse รายละเอียด
- [x] Frontend: Dialog ยืนยันจัดส่ง/ยกเลิก/ปฏิเสธสลิป
- [x] Frontend: เพิ่ม link ใน SellerDashboard header
- [x] Frontend: เพิ่ม link ใน Navbar dropdown
- [x] Route: /seller/orders
- [x] Unit tests: seller-orders.test.ts (7 tests passed)

## Phase 20: ค่าขนส่ง + วิธีชำระเงิน Wallet/COD (Jul 2026)
- [x] Schema: เพิ่ม shippingFee, allowCod, allowWallet ใน products table
- [x] Schema: เพิ่ม shippingFee, totalAmount, paymentMethod enum ใน orders table
- [x] Backend: products router รองรับ shippingFee, allowCod, allowWallet
- [x] Backend: orders.create รองรับ wallet (หักยอดทันที), cod, promptpay
- [x] Backend: validate payment method ตาม seller settings
- [x] Frontend: Sell.tsx เพิ่มช่องค่าขนส่ง + checkbox Wallet/COD
- [x] Frontend: ProductDetail.tsx แสดง shipping fee badge + วิธีชำระที่รับ
- [x] Frontend: Checkout.tsx เพิ่ม payment method selector (PromptPay/Wallet/COD)
- [x] Frontend: Checkout.tsx แสดงยอดรวม (ราคา + ค่าขนส่ง)
- [x] Frontend: SellerOrders.tsx แสดง COD/Wallet badge + ปุ่ม "บันทึกการจัดส่ง" สำหรับ COD

## Phase 21 (Completed): ระบบสต๊อกสินค้า + ระยะเวลาจัดส่ง (Jul 2026)
- [x] Schema: deliveryDays column มีอยู่แล้ว (default 3)
- [x] Backend: products router รองรับ deliveryDays มีอยู่แล้ว
- [x] Backend: orders.create ตัดสต๊อก อัตโนมัติ มีอยู่แล้ว
- [x] Backend: updateStock procedure มีอยู่แล้ว
- [x] Frontend: Sell.tsx มีช่องระยะเวลาจัดส่ง มีอยู่แล้ว
- [x] Frontend: ProductDetail.tsx แสดง badge "จัดส่งใน X วัน" มีอยู่แล้ว
- [x] Frontend: ProductCard.tsx แสดง badge "หมด" มีอยู่แล้ว
- [x] Frontend: SellerDashboard มีปุ่มแก้ไขสต๊อก มีอยู่แล้ว

## Phase 22: หน้าร้านค้าสาธารณะ (Public Seller Store)
- [x] Backend: getSellerProfile procedure (ข้อมูลผู้ขาย + สินค้า + สถิติ)
- [x] Frontend: SellerStore.tsx แบบ Shopee (cover, avatar, stats, สินค้าขายดี, grid)
- [x] เชื่อม route /shop/:userId
- [x] เพิ่ม link จาก ProductDetail ไปหน้าร้านค้า
- [x] เพิ่ม link "ดูร้านค้าของฉัน" ใน SellerDashboard

## Phase 23: Smart Feed — Personalized + Popularity Sorting

- [x] Backend: เพิ่ม product_views table (user_id nullable, product_id, category_id, viewed_at)
- [x] Backend: บันทึก view event เมื่อผู้ใช้เปิดดูสินค้า (products.getById)
- [x] Backend: getProducts รองรับ sortBy: "smart" | "popular" | "newest" | "price_asc" | "price_desc"
- [x] Backend: smart score = (likeCount×3 + viewCount×1) × freshness × personalBoost
- [x] Backend: personalBoost — ดึง top categories จาก product_views ของ user แล้ว boost สินค้าในหมวดนั้น
- [x] Backend: popular score = likeCount×3 + viewCount×1 (ไม่มี personalization)
- [x] Frontend: Products.tsx เพิ่ม sort selector (ล่าสุด / ยอดนิยม / แนะนำสำหรับคุณ / ราคาต่ำ-สูง / ราคาสูง-ต่ำ)
- [x] Frontend: Home.tsx product grid ใช้ smart sort เป็น default

## Phase 24: หน้าคำสั่งซื้อของฉัน (My Orders — Shopee Style)

- [x] Frontend: MyOrders.tsx — tabs ทุกสถานะ (ทั้งหมด/รอชำระ/รอยืนยัน/รอจัดส่ง/ระหว่างจัดส่ง/สำเร็จ/ยกเลิก)
- [x] Frontend: Order card แสดง seller name + avatar, รูปสินค้า, ชื่อ, ราคา, tracking number, action buttons
- [x] Frontend: Action buttons ตามสถานะ (อัปโหลดสลิป/ยืนยันรับสินค้า/รีวิว/ซื้ออีกครั้ง/ยกเลิก)
- [x] Frontend: Empty state สวยงาม + icon ตามแต่ละสถานะ
- [x] Route: /my-orders เพิ่มใน App.tsx
- [x] Link: เพิ่มใน Navbar dropdown (หลัง โปรไฟล์)
- [x] Backend: myPurchases เพิ่ม status filter + counts + seller info enrichment

## Phase 25: Xianyu-style App UX

- [x] สร้าง BottomNav.tsx (5 แท็บ: หน้าหลัก / สินค้า / ลงขาย / แชท / ของฉัน)
- [x] ปุ่มลงขายกลาง — ใหญ่กว่า มีสีสดใส + shadow
- [x] Badge แจ้งเตือนบนแท็บแชท (unread count)
- [x] ซ่อน Navbar บน mobile (md:hidden) เมื่อมี BottomNav แสดง
- [x] ปรับหน้า Profile (/profile) สไตล์ Xianyu: gradient header, stats row, quick links, tabs
- [x] เพิ่ม padding-bottom pb-16 ให้ content ไม่ถูก BottomNav บัง
- [x] ปุ่ม Logout ในหน้า Profile

## Phase 26: แก้ไข Admin + แยกคำสั่งซื้อ/ขาย
- [x] ตรวจสอบว่า Admin.tsx render ได้ปกติ และ route /admin ทำงาน
- [x] BottomNav: Admin shortcut แสดงได้ถูกต้องสำหรับ admin role
- [x] แยกหน้า "MyOrders" (ผู้ซื้อ) ออกจาก "SellerOrders" (ผู้ขาย) ให้ชัดเจน
- [x] MyOrders: header gradient สีน้ำเงิน-indigo, icon ShoppingBag, ปุ่ม link ไปคำสั่งขาย
- [x] SellerOrders: header gradient สีส้ม-amber, icon Store, ปุ่ม link ไปการซื้อ + แดชบอร์ด
- [x] Navbar dropdown: แยก label ชัดเจน "คำสั่งซื้อ (ผู้ซื้อ)" vs "คำสั่งขาย (ผู้ขาย)" พร้อม badge สี

## Phase 27: Shopee-style Quick Action Bar ใน Chat (Jul 2026)
- [x] เพิ่ม Quick Action Bar ด้านบน input field ใน Chat.tsx
- [x] 4 ปุ่ม: Close/Delete (X), Bag (Product), Quick Replies (Text), Emoji/Send (😊 + ▶️)
- [x] ปรับ layout ให้ responsive + ไม่ถูกแป้นพิมพ์บัง
- [x] Unit tests สำหรับ Quick Action Bar interactions (16 tests passed)

## Phase 28: Payment Methods Configuration ใน Sell.tsx (Jul 2026)
- [x] Schema: เพิ่ม bankName, bankAccountNumber, bankAccountName, promptpayQrUrl, promptpayQrKey, allowPromptpay ใน products table
- [x] Backend: products router รองรับ payment methods fields ใน create/update
- [x] Frontend: Sell.tsx เพิ่มส่วน "ตั้งค่าวิธีรับเงิน" (Payment Methods section)
- [x] Frontend: Checkbox สำหรับ PromptPay
- [x] Frontend: Form fields สำหรับเลขบัญชี (ชื่อธนาคาร, เลขบัญชี, ชื่อบัญชี)
- [x] Frontend: Upload QR Code PromptPay
- [x] Frontend: แสดง Preview QR Code หลังอัปโหลด
- [x] Backend: Validation ให้เลือกวิธีรับเงินอย่างน้อย 1 วิธี
- [x] Backend: Validation ให้กรอกเลขบัญชีหรือ QR Code เมื่อเลือก PromptPay
- [x] Unit tests สำหรับ payment methods validation (20 tests passed)

## Phase 29: ค้นหาด้วยรูปภาพ (Vision AI Image Search)
- [x] Backend: products.searchByImage procedure (รับ base64 image → Vision LLM วิเคราะห์ → ค้นหาสินค้า)
- [x] Frontend: Products.tsx เพิ่มปุ่มกล้อง + file input (accept="image/*") ข้างแถบค้นหา
- [x] Frontend: อัปโหลดรูป → เรียก searchByImage → auto-fill keyword + แสดงผลค้นหา
- [x] Frontend: Loading state ขณะ AI วิเคราะห์รูป
- [x] BottomNav: เปลี่ยนไอคอนกลางจาก Search เป็น Camera (link ไป /products)

## Phase 30 (Completed): แก้ "ขายแล้ว" + ระบบค้นหาด้วยรูปภาพ (Jul 2026)
- [x] markAsSold ต้องอัปโหลดสลิป (saleSlipBase64) ก่อนเปลี่ยนสถานะ
- [x] searchByImage ใช้ Vision AI แบบ 3 Pass ไม่ใช้ response_format json_schema

## Phase 31 (Completed): UI Localization & Navigation Fix (Jul 2026)
- [x] แก้ไขข้อความภาษาจีนเป็นไทยใน Profile.tsx ให้เสร็จทั้งหมด
- [x] ทำให้ปุ่มใน Profile.tsx ใช้งานได้จริง (เชื่อมลิงก์ไปยังหน้าที่ถูกต้อง)

## Phase 31 (Completed): ระบบตรวจสอบสลิปอัตโนมัติด้วย Vision AI (Jul 2026)
- [x] DB: soldAt column มีอยู่แล้ว
- [x] Backend: markAsSold รับ saleSlipBase64 + ตรวจสอบมีอยู่แล้ว
- [x] Backend: verifySlip helper มีอยู่แล้ว
- [x] Backend: เปรียบเทียบข้อมูลสลิปกับ order มีอยู่แล้ว
- [x] Backend: อนุมัติอัตโนมัติถ้าผ่านเกณฑ์ มีอยู่แล้ว
- [x] Backend: verifySlip ใช้ใน orders.uploadSlip ด้วย มีอยู่แล้ว
- [x] Frontend: SellerDashboard มีปุ่ม "ขายแล้ว" + dialog อัปโหลดสลิป
- [x] Frontend: แสดงผลตรวจสอบสลิป (confidence %)

## Phase 32 (Completed): Bank Deep Link — กดเลขบัญชีเปิดแอปธนาคาร (Jul 2026)
- [x] สร้าง getBankDeepLink(bankName, accountNumber) helper ใน client/src/lib/bankDeepLink.ts
- [x] รองรับธนาคารไทยหลัก: กสิกร (KBank), SCB, กรุงไทย (KTB), กรุงเทพ (BBL), ทหารไทย (TTB), ออมสิน, ธ.ก.ส.
- [x] Checkout.tsx: เลขบัญชีเป็น clickable link → เปิดแอปธนาคาร + fallback copy to clipboard
- [x] OrderDetail.tsx: เลขบัญชีเป็น clickable link เช่นกัน
- [x] แสดง tooltip "แตะเพื่อเปิดแอปธนาคาร"

## Phase 32b (Completed): MyOrders Page Redesign (Jul 2026)
- [x] ปรับ MyOrders.tsx ให้มี 6 tabs แบบ Taobao (รอชำระเงิน/รอส่งสินค้า/รอรับสินค้า/รอให้คะแนน/คืนเงิน)
- [x] ปรับลิงก์ status parameters ใน Profile.tsx ให้ตรงกับ MyOrders.tsx

## Phase 33 (Completed): Profile Button Cleanup (Jul 2026)
- [x] ลบ Tools section ออกจาก Profile.tsx (เพราะซ้ำกับ My Orders section)
- [x] เก็บ Promotions section ไว้ (เป็นส่วนเสริมสำหรับทุกคน)

## Phase 34b (Completed): Bank Deep Link — กดเลขบัญชีเปิดแอปธนาคาร (Jul 2026)
- [x] สร้าง getBankDeepLink(bankName, accountNumber) helper ใน client/src/lib/bankDeepLink.ts (มีอยู่แล้ว)
- [x] รองรับธนาคารไทยหลัก: กสิกร (KBank), SCB, กรุงไทย (KTB), กรุงเทพ (BBL), ทหารไทย (TTB), ออมสิน, ธ.ก.ส. (มีอยู่แล้ว)
- [x] Checkout.tsx: เลขบัญชีเป็น clickable link → เปิดแอปธนาคาร + fallback copy to clipboard
- [x] OrderDetail.tsx: เลขบัญชีเป็น clickable link เช่นกัน
- [x] แสดง tooltip "แตะเพื่อเปิดแอปธนาคาร"

## Phase 35 (Completed): Sell Button Restoration (Jul 2026)
- [x] เพิ่มปุ่ม "ลงขายสินค้า" ใน Home.tsx (banner สีเหลือง)
- [x] เพิ่มปุ่ม "ลงขายสินค้าทันที" ใน Profile.tsx (button สีเหลือง)

## Phase 36 (Completed): Bank Account Menu Restoration (Jul 2026)
- [x] เพิ่มเมนู "บัญชีรับเงิน" ใน More Options ของ Profile.tsx
- [x] วางไว้ใกล้กับ "ที่อยู่รับสินค้า"



## Phase 37 (Completed): Push Notifications System (Jul 2026)
- [x] Backend: สร้าง pushNotification.ts helper
- [x] Backend: ส่ง notification เมื่อมีข้อความแชทใหม่
- [x] Backend: ส่ง notification เมื่อสถานะคำสั่งซื้อเปลี่ยน
- [x] Backend: ส่ง notification เมื่อสินค้าขายแล้ว
- [x] Backend: ส่ง notification เมื่อได้รับเงิน

## Bug Fixes (Jul 2026 - Round 2)
- [x] แก้ Badge แจ้งเตือนมั่วใน Profile.tsx — ดึงข้อมูลจริงจาก myPurchases.counts (backend)
- [x] แก้ลิงก์ "บัญชีรับเงิน" → /payment-settings (หน้าใหม่ PaymentSettings.tsx)
- [x] ติดตั้ง Web Push Notification จริง (VAPID + Service Worker + Push API)
- [x] Backend: push_subscriptions table + pushRouter (subscribe/unsubscribe/getVapidPublicKey)
- [x] Frontend: usePushNotification hook + ปุ่ม toggle ใน Profile.tsx
- [x] ส่ง push notification เมื่อมีแชทใหม่ / order status เปลี่ยน (dual-channel: Manus API + Web Push)
- [x] 8 vitest tests passed สำหรับ webPush functions

## Feature: ปุ่มลบสินค้า / ขายนอกระบบ (Jul 2026)
- [x] Backend: products.deleteProduct procedure (ตรวจสอบไม่มี active order ก่อนลบ)
- [x] Backend: products.markSoldExternal procedure (เปลี่ยน status เป็น sold + sold_note="ขายนอกระบบ")
- [x] Frontend: SellerDashboard.tsx — เพิ่มปุ่ม "ขายนอกระบบ" และ "ลบสินค้า" ในแต่ละ product card
- [x] Frontend: ProductDetail.tsx — เพิ่มปุ่มสำหรับเจ้าของสินค้า (ขายนอกระบบ / ลบสินค้า)
- [x] Frontend: Confirm dialog ก่อนลบ/เปลี่ยนสถานะ

## Feature: Feed Algorithm ใหม่ (Jul 2026)
- [x] Backend: เพิ่ม seed parameter ใน products.list procedure + getProducts
- [x] Backend: ปรับ smart sort ให้ใช้ seed จาก client แทน server-side timestamp
- [x] Frontend: Home.tsx — ส่ง seed แบบ session-based (สุ่มครั้งเดียวต่อ session)
- [x] Frontend: Home.tsx — invalidate cache + reset ทันทีเมื่อกลับมาหน้าแรก (useEffect focus)
- [x] Frontend: Home.tsx — staleTime = 0 เพื่อให้ query ยิงใหม่ทุกครั้ง

## Feature: ระบบจัดการการขาย COD ครบวงจร (Jul 2026)
- [x] Schema: เพิ่ม shippingProvider, trackingNumber, shippedAt ใน orders table
- [x] Backend: orders.updateShipping procedure (บันทึกเลขพัสดุ+ขนส่ง, เปลี่ยน status เป็น shipped)
- [x] Frontend: SellerDashboard — Shipping Dialog: คัดลอกที่อยู่+สรุปราคา COD, เลือกขนส่ง, ใส่เลขพัสดุ, ยืนยันส่ง
- [x] Frontend: แสดงเลขพัสดุ+ขนส่งในออเดอร์ที่จัดส่งแล้ว พร้อมลิงก์ tracking
- [x] Frontend: ปุ่ม "คัดลอกที่อยู่" สำหรับ copy ข้อความพร้อมส่ง

## Feature: ยืนยันรับออเดอร์ + แก้ค่าธรรมเนียม COD (Jul 2026)
- [x] Backend: orders.confirmOrder procedure (status: pending_payment → confirmed_by_seller)
- [x] Frontend: SellerOrders — ปุ่ม "ยืนยันรับออเดอร์" ในแท็บ "รอจัดส่ง" (COD) / "รอยืนยันสลิป" (โอน)
- [x] แก้ค่าธรรมเนียม COD +3%: ต้องไม่บวกซ้ำถ้าบวกไปแล้ว — ตรวจสอบจุดที่คำนวณ

## Feature: ยืนยันรับออเดอร์ COD ครบวงจร (Jul 2026)
- [x] Schema: เพิ่ม seller_confirmed ใน orders status enum
- [x] Backend: orders.confirmOrder — เปลี่ยน order status → seller_confirmed, เปลี่ยน product status → sold, ส่งข้อความแชตอัตโนมัติพร้อมวันจัดส่ง
- [x] Frontend: SellerOrders — ปุ่ม "ยืนยันรับออเดอร์" + dialog เลือกวันจัดส่ง (วันนี้/พรุ่งนี้/เลือกเอง)
- [x] Frontend: SellerOrders — canShip ต้องเช็ค seller_confirmed ด้วย
- [x] แก้ COD +3% ให้บันทึก totalAmount ที่รวม fee ใน DB ด้วย

- [x] แก้ SellerOrders และ ShipOrderDialog ให้แสดงยอด COD จาก totalAmount รวมค่าธรรมเนียม +3% ถูกต้องทุกจุด
- [x] แก้หน้า SellerOrders ให้หลังยืนยันรับออเดอร์ COD แล้วรายการ refresh และเปลี่ยนสถานะใน UI ทันที
- [x] เพิ่มระบบติดตามพัสดุฝั่งผู้ซื้อใน MyOrders พร้อมปุ่มติดตาม 17TRACK และรายละเอียดผู้ให้บริการขนส่ง
- [x] เพิ่มหน้า TrackingDetail สำหรับแสดง timeline พัสดุและแผนที่จากข้อมูลเลขพัสดุ
- [x] เพิ่ม backend tracking procedure สำหรับเตรียมข้อมูลติดตามพัสดุและ fallback ไปยัง 17TRACK URL เมื่อยังไม่มี API key
- [x] เพิ่ม vitest coverage สำหรับการ map ข้อมูล tracking และการคืนค่า tracking URL
- [x] แก้ ShipOrderDialog ให้แสดงราคา totalAmount รวม +3% COD แทน amount
- [x] แก้ปุ่มยืนยันรับออเดอร์ COD ที่หายไปใน SellerOrders

## Bug Fixes (Jul 2026 - Round 3): COD Amount + Tracking
- [x] แก้ ShipOrderDialog ให้แสดงราคา totalAmount รวม +3% COD (fallback คำนวณใหม่ถ้า totalAmount = 0)
- [x] แก้ SellerOrders ConfirmCodDialog ให้แสดงราคา totalAmount รวม +3% COD (fallback คำนวณใหม่)
- [x] แก้ SellerOrders order card ให้แสดงราคา totalAmount รวม +3% COD (fallback คำนวณใหม่)
- [x] อัปเดต totalAmount ใน DB สำหรับ COD orders เก่าที่ totalAmount = amount (ไม่รวม COD fee)
- [x] เพิ่มระบบติดตามพัสดุ: หน้า TrackingDetail.tsx พร้อมแผนที่ Google Maps + timeline status
- [x] เพิ่มปุ่ม "ติดตามพัสดุ" ใน MyOrders.tsx เมื่อสถานะ shipped
- [x] เพิ่ม seller_confirmed ใน STATUS_BADGE ของ MyOrders.tsx
- [x] เพิ่ม getTrackingInfo procedure ใน orders.ts
- [x] เพิ่ม route /tracking/:orderId ใน App.tsx

## Bug Fix: COD Flow (Jul 2026)
- [x] แก้ SellerOrders ให้ order COD ที่ status=pending_payment แสดงปุ่ม "ยืนยันรับออเดอร์" (ไม่ใช่ปุ่มจัดส่ง)
- [x] แก้ SellerOrders ให้ order COD ที่ status=seller_confirmed แสดงปุ่ม "บันทึกการจัดส่ง" เท่านั้น
- [x] ตรวจสอบว่า order ที่ผู้ใช้เห็นใน screenshot มีสถานะอะไรจริงๆ

## Bug Fix: Push Notification ไม่ทำงาน (Jul 2026)
- [x] แก้ saveWebPushSubscription: check existing ใช้ endpoint ตรงๆ แต่ insert เป็น JSON — ทำให้ไม่เจอ existing
- [x] เพิ่ม auto-subscribe push notification หลัง login (ไม่ต้องรอให้ user กดเปิดเอง)
- [x] ทดสอบ push notification end-to-end (81 tests passed)

## Phase 38: Profile UX/UI Redesign — แยกฝั่งซื้อ/ขายชัดเจน (Jul 2026)
- [x] ลบ VIP Banner + Promotions section (ยังไม่มีระบบจริง ทำให้สับสน)
- [x] ลบปุ่ม "ลงขายสินค้าทันที" ซ้ำ (BottomNav มีอยู่แล้ว)
- [x] แยก section "ฝั่งซื้อ" (สีน้ำเงิน/indigo) — คำสั่งซื้อ, ที่อยู่, ร้านที่ติดตาม
- [x] แยก section "ฝั่งขาย" (สีส้ม/amber) — ร้านค้าของฉัน, คำสั่งขาย, บัญชีรับเงิน, สินค้าที่ขาย
- [x] รวม Quick Stats ให้แสดงเฉพาะข้อมูลจริง (สินค้าของฉัน, ยอดขาย, ร้านที่ติดตาม)
- [x] จัดกลุ่ม Settings (แจ้งเตือน, ศูนย์ช่วยเหลือ, ออกจากระบบ) ไว้ด้านล่างสุด

## Phase 39: Home page — ลบโปรไฟล์ เน้นโชว์สินค้า (Jul 2026)
- [x] ลบ User Profile Section ออกจากหน้า Home (line 127-194)
- [x] ให้หน้า Home เน้นโชว์สินค้าเป็นหลัก — search, categories, products grid

## Phase 40: COD Agreement System — บทลงโทษผู้ซื้อที่ไม่รับสินค้า (Jul 2026)
- [x] ร่างเงื่อนไข COD Agreement + บทลงโทษ
- [x] เพิ่ม order status "waiting_buyer_confirm" ใน flow
- [x] Backend: ผู้ขายกดยืนยัน → เปลี่ยนสถานะเป็น waiting_buyer_confirm → ส่ง notification ให้ผู้ซื้อ
- [x] Backend: ผู้ซื้อกดยอมรับเงื่อนไข → เปลี่ยนสถานะเป็น confirmed → ผู้ขายส่งสินค้าได้
- [x] UI ฝั่งผู้ซื้อ: แสดง modal เงื่อนไข COD + ปุ่มยอมรับ
- [x] UI ฝั่งผู้ขาย: แสดงสถานะรอผู้ซื้อยืนยัน + ไม่ให้กดส่งสินค้าจนกว่าผู้ซื้อจะยอมรับ
- [x] บันทึก buyer_strikes (จำนวนครั้งที่ไม่รับสินค้า) สำหรับบทลงโทษ (ระบุไว้ในเงื่อนไข)

## Bug Fix: ProductCard แสดงเลข 0 โดดๆ ไม่มี label (Jul 2026)
- [x] แก้ ProductCard ไม่ให้แสดง salesCount เมื่อเป็น 0 — React gotcha: `0 && jsx` renders "0" → แก้เป็น explicit > 0 check
- [x] ตรวจสอบว่า "0" ที่เห็นใน screenshot มาจาก salesCount=0 ที่ React render เป็นตัวเลข (confirmed via API)
