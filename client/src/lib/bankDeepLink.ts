/**
 * Bank Deep Link Utility — เปิดแอปธนาคารไทยพร้อมกรอกเลขบัญชีอัตโนมัติ
 *
 * รองรับ: กสิกร, SCB, กรุงไทย, กรุงเทพ, ทหารไทยธนชาต, ออมสิน, UOB, CIMB, KKP, LH Bank
 *
 * หมายเหตุ: Deep link ของแต่ละธนาคารมีข้อจำกัดต่างกัน บางธนาคารรองรับ
 * account number pre-fill บางธนาคารเปิดแค่หน้า transfer
 */

export interface BankInfo {
  name: string;
  shortName: string;
  color: string;
  logo: string; // emoji fallback
  deepLinkScheme: string | null;
  appStoreUrl: string;
  playStoreUrl: string;
  /** สร้าง deep link พร้อมเลขบัญชี (ถ้ารองรับ) */
  buildTransferLink: (accountNumber: string, amount?: number) => string | null;
}

/** แผนที่ชื่อธนาคาร → ข้อมูล */
export const BANKS: Record<string, BankInfo> = {
  kbank: {
    name: "ธนาคารกสิกรไทย",
    shortName: "กสิกร",
    color: "#1BA345",
    logo: "🟢",
    deepLinkScheme: "kplus://",
    appStoreUrl: "https://apps.apple.com/th/app/k-plus/id381458708",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.kasikorn.retail.mbanking.wap",
    buildTransferLink: (acc, amount) => {
      // K PLUS deep link: kplus://transfer?accountNo=XXXX&amount=YY
      const clean = acc.replace(/[^0-9]/g, "");
      let url = `kplus://transfer?accountNo=${clean}`;
      if (amount) url += `&amount=${amount}`;
      return url;
    },
  },
  scb: {
    name: "ธนาคารไทยพาณิชย์",
    shortName: "SCB",
    color: "#4E2683",
    logo: "🟣",
    deepLinkScheme: "scbeasy://",
    appStoreUrl: "https://apps.apple.com/th/app/scb-easy/id590562917",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.scb.phone",
    buildTransferLink: (acc, amount) => {
      const clean = acc.replace(/[^0-9]/g, "");
      let url = `scbeasy://transfer?accountNo=${clean}`;
      if (amount) url += `&amount=${amount}`;
      return url;
    },
  },
  ktb: {
    name: "ธนาคารกรุงไทย",
    shortName: "กรุงไทย",
    color: "#00AEEF",
    logo: "🔵",
    deepLinkScheme: "ktbnetbank://",
    appStoreUrl: "https://apps.apple.com/th/app/krungthai-next/id1070617756",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.ktb.ktbnext",
    buildTransferLink: (acc, amount) => {
      // Krungthai NEXT — เปิดหน้า transfer
      const clean = acc.replace(/[^0-9]/g, "");
      let url = `ktbnetbank://transfer?accountNo=${clean}`;
      if (amount) url += `&amount=${amount}`;
      return url;
    },
  },
  bbl: {
    name: "ธนาคารกรุงเทพ",
    shortName: "กรุงเทพ",
    color: "#1E3A8A",
    logo: "🔷",
    deepLinkScheme: "bblmobile://",
    appStoreUrl: "https://apps.apple.com/th/app/bualuang-mbanking/id371362673",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.bbl.mobilebanking",
    buildTransferLink: (_acc, _amount) => {
      // BBL ไม่รองรับ deep link pre-fill — เปิดแอปเฉยๆ
      return "bblmobile://";
    },
  },
  ttb: {
    name: "ธนาคารทหารไทยธนชาต",
    shortName: "TTB",
    color: "#F26522",
    logo: "🟠",
    deepLinkScheme: "ttbtouch://",
    appStoreUrl: "https://apps.apple.com/th/app/ttb-touch/id1591009700",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.ttbbank.oneapp.prod",
    buildTransferLink: (_acc, _amount) => "ttbtouch://",
  },
  gsb: {
    name: "ธนาคารออมสิน",
    shortName: "ออมสิน",
    color: "#E60026",
    logo: "🔴",
    deepLinkScheme: "mymo://",
    appStoreUrl: "https://apps.apple.com/th/app/mymo-by-gsb/id1448546955",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.gsb.mymo",
    buildTransferLink: (_acc, _amount) => "mymo://",
  },
  bay: {
    name: "ธนาคารกรุงศรีอยุธยา",
    shortName: "กรุงศรี",
    color: "#FFC72C",
    logo: "🟡",
    deepLinkScheme: "krungsri://",
    appStoreUrl: "https://apps.apple.com/th/app/krungsri-mobile/id1012521446",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.krungsri.kma",
    buildTransferLink: (_acc, _amount) => "krungsri://",
  },
  uob: {
    name: "ธนาคาร UOB",
    shortName: "UOB",
    color: "#005BAC",
    logo: "🏦",
    deepLinkScheme: null,
    appStoreUrl: "https://apps.apple.com/th/app/uob-tmrw-thailand/id1479436244",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.uob.tmrw.th",
    buildTransferLink: () => null,
  },
  cimb: {
    name: "ธนาคาร CIMB",
    shortName: "CIMB",
    color: "#E2231A",
    logo: "🏦",
    deepLinkScheme: null,
    appStoreUrl: "https://apps.apple.com/th/app/cimb-thai/id1095571296",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.cimb.th.cimbclicks",
    buildTransferLink: () => null,
  },
  lhb: {
    name: "ธนาคาร LH Bank",
    shortName: "LH Bank",
    color: "#00843D",
    logo: "🏦",
    deepLinkScheme: null,
    appStoreUrl: "https://apps.apple.com/th/app/lh-bank-m-choice/id1076052093",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.lhbank.mchoice",
    buildTransferLink: () => null,
  },
};

/** แมปชื่อธนาคาร (ภาษาไทย/อังกฤษ) → key ใน BANKS */
const BANK_NAME_MAP: Record<string, string> = {
  กสิกร: "kbank",
  "กสิกรไทย": "kbank",
  kbank: "kbank",
  "k-bank": "kbank",
  "kasikorn": "kbank",
  scb: "scb",
  "ไทยพาณิชย์": "scb",
  "thai commercial": "scb",
  กรุงไทย: "ktb",
  ktb: "ktb",
  "krungthai": "ktb",
  กรุงเทพ: "bbl",
  bbl: "bbl",
  "bangkok bank": "bbl",
  ttb: "ttb",
  "ทหารไทย": "ttb",
  "ธนชาต": "ttb",
  "ทหารไทยธนชาต": "ttb",
  ออมสิน: "gsb",
  gsb: "gsb",
  กรุงศรี: "bay",
  "กรุงศรีอยุธยา": "bay",
  bay: "bay",
  "krungsri": "bay",
  uob: "uob",
  cimb: "cimb",
  "lh bank": "lhb",
  lhb: "lhb",
};

/** หา BankInfo จากชื่อธนาคาร (case-insensitive) */
export function getBankInfo(bankName: string | null | undefined): BankInfo | null {
  if (!bankName) return null;
  const key = BANK_NAME_MAP[bankName.toLowerCase().trim()] ?? BANK_NAME_MAP[bankName.trim()];
  return key ? BANKS[key] : null;
}

/**
 * เปิดแอปธนาคารพร้อมกรอกเลขบัญชี
 * - ถ้ามี deep link → เปิด deep link
 * - ถ้าไม่มี → copy เลขบัญชีแล้วเปิด App Store / Play Store
 */
export function openBankApp(
  bankName: string | null | undefined,
  accountNumber: string,
  amount?: number
): { opened: boolean; message: string } {
  const bank = getBankInfo(bankName);
  if (!bank) {
    return { opened: false, message: "ไม่พบข้อมูลธนาคาร" };
  }

  const deepLink = bank.buildTransferLink(accountNumber, amount);
  if (deepLink) {
    // ใช้ invisible anchor แทน window.location.href เพื่อผ่าน browser security policy
    const a = document.createElement("a");
    a.href = deepLink;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    // ลบหลัง click
    setTimeout(() => document.body.removeChild(a), 500);
    return { opened: true, message: `เปิดแอป ${bank.shortName} แล้ว` };
  }

  // Fallback: detect iOS vs Android
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const storeUrl = isIOS ? bank.appStoreUrl : bank.playStoreUrl;
  window.open(storeUrl, "_blank", "noopener,noreferrer");
  return { opened: false, message: `กรุณาเปิดแอป ${bank.shortName} แล้วกรอกเลขบัญชีเอง` };
}
