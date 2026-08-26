import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { normalizeTag, stringArray, weightedArray, type InterestProfileDto, type WeightedInterest } from './interestTypes';

const cache = new Map<string, { expiresAt: number; value: InterestProfileDto }>();
const CACHE_MS = 60_000;

function explicit(tags: string[]): WeightedInterest[] {
  const now = new Date().toISOString();
  return [...new Map(tags.map((tag) => [normalizeTag(tag), tag.trim()] as const))]
    .filter(([key]) => key)
    .slice(0, 50)
    .map(([normalizedTag, tag]) => ({ tag, normalizedTag, weight: 1, source: 'PROFILE', lastSeenAt: now }));
}

function map(row: any): InterestProfileDto {
  return {
    userId: row.userId,
    explicitInterests: weightedArray(row.explicitInterestsJson),
    occupation: row.occupation,
    occupationVisible: row.occupationVisible,
    careerField: row.careerField,
    careerFieldVisible: row.careerFieldVisible,
    skills: stringArray(row.skillsJson),
    skillsVisible: row.skillsVisible,
    interestsVisible: row.interestsVisible,
    preferredCategories: stringArray(row.preferredCategoriesJson),
    categoriesVisible: row.categoriesVisible,
    behavioralInterests: weightedArray(row.behavioralInterestsJson),
    searchInterests: weightedArray(row.searchInterestsJson),
    locationPreferences: weightedArray(row.locationPreferencesJson),
    personalizationEnabled: row.personalizationEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getInterestProfile(userId: string): Promise<InterestProfileDto> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const row = await prisma.userInterestProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const value = map(row);
  cache.set(userId, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}

export async function updateInterestProfile(userId: string, input: Record<string, unknown>) {
  const tags = Array.isArray(input.explicitInterests)
    ? input.explicitInterests.map((v) => typeof v === 'string' ? v : String((v as any)?.tag ?? ''))
    : undefined;
  const text = (key: string, max: number) => {
    if (input[key] === undefined) return undefined;
    if (input[key] === null || input[key] === '') return null;
    const value = String(input[key]).trim();
    if (value.length > max) throw new AppError('VALIDATION', `${key} ยาวเกินกำหนด`, 400);
    return value;
  };
  const list = (key: string, max = 30) => input[key] === undefined ? undefined
    : [...new Set((Array.isArray(input[key]) ? input[key] as unknown[] : []).map(String).map((v) => v.trim()).filter(Boolean))].slice(0, max);
  const bool = (key: string) => input[key] === undefined ? undefined : Boolean(input[key]);
  const data = {
    explicitInterestsJson: tags ? explicit(tags) : undefined,
    occupation: text('occupation', 80), occupationVisible: bool('occupationVisible'),
    careerField: text('careerField', 80), careerFieldVisible: bool('careerFieldVisible'),
    skillsJson: list('skills'), skillsVisible: bool('skillsVisible'),
    interestsVisible: bool('interestsVisible'),
    preferredCategoriesJson: list('preferredCategories'), categoriesVisible: bool('categoriesVisible'),
    personalizationEnabled: bool('personalizationEnabled'),
    vectorVersion: { increment: 1 },
  };
  const { vectorVersion: _increment, ...createData } = data;
  await prisma.userInterestProfile.upsert({ where: { userId }, create: { userId, ...createData, vectorVersion: 1 }, update: data });
  cache.delete(userId);
  return getInterestProfile(userId);
}

export function invalidateInterestProfile(userId: string) { cache.delete(userId); }

const TAG_NEIGHBORS: Record<string, string[]> = {
  'รถไฟฟ้า': ['แบตเตอรี่', 'มอเตอร์', 'แต่งรถ', 'อะไหล่รถไฟฟ้า'],
  'กล้อง': ['ถ่ายภาพ', 'เลนส์', 'วิดีโอ', 'ท่องเที่ยว'],
  'อสังหาริมทรัพย์': ['บ้าน', 'คอนโด', 'ช่างไฟ', 'ตกแต่งบ้าน'],
  'ทำอาหาร': ['อาหาร', 'ครัว', 'วัตถุดิบ', 'ร้านอาหาร'],
};
export async function suggestInterestTags(query: string) {
  const normalized = normalizeTag(query);
  const catalog = await prisma.catalogItem.findMany({ where: { status: 'ACTIVE' }, select: { title: true, metadataJson: true }, take: 100 });
  const candidates = new Set<string>(Object.keys(TAG_NEIGHBORS));
  Object.values(TAG_NEIGHBORS).flat().forEach((tag) => candidates.add(tag));
  for (const row of catalog) {
    row.title.split(/[\s,/#]+/).filter((v) => v.length > 1).forEach((tag) => candidates.add(tag));
    const meta = row.metadataJson as Record<string, unknown>;
    if (Array.isArray(meta.tags)) meta.tags.map(String).forEach((tag) => candidates.add(tag));
  }
  const direct = TAG_NEIGHBORS[normalized] ?? [];
  return [...new Set([...direct, ...candidates].filter((tag) => !normalized || normalizeTag(tag).includes(normalized) || normalized.includes(normalizeTag(tag))))].slice(0, 12);
}
