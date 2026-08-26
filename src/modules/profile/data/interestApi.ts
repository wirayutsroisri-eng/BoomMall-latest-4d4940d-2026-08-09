import { apiFetch, resolveApiBase } from '@/shared/api/apiBase';
import { authHeaders } from '@/modules/auth/state/auth-store';

export type InterestProfile = {
  explicitInterests: { tag: string }[];
  occupation: string | null; occupationVisible: boolean;
  careerField: string | null; careerFieldVisible: boolean;
  skills: string[]; skillsVisible: boolean; interestsVisible: boolean;
  preferredCategories: string[]; categoriesVisible: boolean;
  personalizationEnabled: boolean;
};

async function request(path: string, init?: RequestInit) {
  const base = resolveApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์');
  const response = await apiFetch(`${base}/api/v1${path}`, { ...init, headers: authHeaders(init?.headers as Record<string, string>) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) throw new Error(json.error?.message ?? 'ไม่สามารถบันทึกข้อมูลได้');
  return json.data;
}

export function getMyInterests(): Promise<InterestProfile> { return request('/me/interests'); }
export function saveMyInterests(value: Partial<InterestProfile>) {
  return request('/me/interests', { method: 'PUT', body: JSON.stringify(value) }) as Promise<InterestProfile>;
}
export function getInterestSuggestions(query: string): Promise<string[]> { return request(`/interest-suggestions?q=${encodeURIComponent(query)}`); }

export function trackBehavior(eventType: string, data: Record<string, unknown> = {}) {
  return request('/events/behavior', { method: 'POST', body: JSON.stringify({ eventType, occurredAt: new Date().toISOString(), ...data }) });
}
