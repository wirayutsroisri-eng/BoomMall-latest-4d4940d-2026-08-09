import { trpc } from "@/lib/trpc";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, X, Camera, Sparkles, ImageOff } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";

type SortBy = "smart" | "popular" | "newest" | "price_asc" | "price_desc";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "smart", label: "✨ แนะนำสำหรับคุณ" },
  { value: "popular", label: "🔥 ยอดนิยม" },
  { value: "newest", label: "🆕 ล่าสุด" },
  { value: "price_asc", label: "ราคา ต่ำ → สูง" },
  { value: "price_desc", label: "ราคา สูง → ต่ำ" },
];

export default function ProductsPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);

  const [searchText, setSearchText] = useState(params.get("q") ?? "");
  const [categoryId, setCategoryId] = useState<number | undefined>(
    params.get("categoryId") ? parseInt(params.get("categoryId")!) : undefined
  );
  const [condition, setCondition] = useState<string | undefined>(undefined);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("smart");
  const initialFilter = params.get("filter");
  const [listingType, setListingType] = useState<"c2c" | "b2b" | undefined>(
    initialFilter === "b2b" || initialFilter === "c2c" ? initialFilter : undefined
  );
  const [wholesaleOnly, setWholesaleOnly] = useState(initialFilter === "wholesale");

  // Image search state
  const [imageSearchMode, setImageSearchMode] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<{
    productName: string;
    brand: string;
    model: string;
    category: string;
    color: string;
    condition: string;
    keywords: string[];
    searchQuery: string;
    confidence: number;
    description: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // อ่านผลจาก BottomNav camera (sessionStorage)
  useEffect(() => {
    const fromImageSearch = params.get("imageSearch") === "1";
    if (!fromImageSearch) return;
    try {
      const stored = sessionStorage.getItem("imageSearchResult");
      const preview = sessionStorage.getItem("imageSearchPreview");
      if (stored) {
        const result = JSON.parse(stored);
        setImageAnalysis(result.analysis);
        if (preview) setPreviewImage(preview);
        // ลบออกหลังใช้แล้ว
        sessionStorage.removeItem("imageSearchResult");
        sessionStorage.removeItem("imageSearchPreview");
        toast.success(`AI ระบุสินค้า: ${result.analysis.productName}`, {
          description: `ความมั่นใจ ${Math.round(result.analysis.confidence * 100)}% — พบ ${result.total} รายการ`,
          duration: 4000,
        });
      }
    } catch {
      // ignore parse errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limit = 24;

  const { data: categoriesData } = trpc.products.categories.useQuery();
  const { data, isLoading } = trpc.products.list.useQuery({
    search: searchText || undefined,
    categoryId,
    condition,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    listingType,
    hasWholesaleTiers: wholesaleOnly || undefined,
    limit,
    offset,
    sortBy,
  });

  const searchByImageMutation = trpc.products.searchByImage.useMutation({
    onSuccess: (result) => {
      setImageAnalysis(result.analysis);
      setSearchText(result.searchQuery);
      setOffset(0);
      setImageSearchMode(false);
      toast.success(`AI ระบุสินค้า: ${result.analysis.productName}`, {
        description: `ความมั่นใจ ${Math.round(result.analysis.confidence * 100)}% — พบ ${result.total} รายการ`,
        duration: 4000,
      });
    },
    onError: (err) => {
      toast.error("ไม่สามารถวิเคราะห์รูปภาพได้", { description: err.message });
      setImageSearchMode(false);
    },
  });

  const activeFiltersCount = [categoryId, condition, minPrice, maxPrice, listingType, wholesaleOnly].filter(Boolean).length;

  function clearFilters() {
    setCategoryId(undefined);
    setCondition(undefined);
    setMinPrice("");
    setMaxPrice("");
    setListingType(undefined);
    setWholesaleOnly(false);
    setOffset(0);
  }

  function clearImageSearch() {
    setPreviewImage(null);
    setImageAnalysis(null);
    setSearchText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("รูปภาพต้องมีขนาดไม่เกิน 10MB");
      return;
    }

    // อ่านไฟล์ครั้งเดียว ใช้ data URL ทั้ง preview และ base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreviewImage(dataUrl);
      // ตัด prefix "data:image/xxx;base64," ออก
      const base64 = dataUrl.split(",")[1];
      setImageSearchMode(true);
      searchByImageMutation.mutate({
        imageData: base64,
        mimeType: file.type,
        limit,
      });
    };
    reader.readAsDataURL(file);
    // reset input เพื่อเลือกไฟล์เดิมซ้ำได้
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [searchByImageMutation, limit]);

  const isImageSearchLoading = searchByImageMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6">

        {/* ── ตลาด BoomMall — ฟิลเตอร์จาก Alpha v39 + B2B/C2C ── */}
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold text-muted-foreground mr-1">ตลาด:</span>
          {[
            { key: "all", label: "ทั้งหมด", on: !listingType && !wholesaleOnly, fn: () => { setListingType(undefined); setWholesaleOnly(false); setOffset(0); } },
            { key: "wholesale", label: "▦ ราคาส่ง", on: wholesaleOnly, fn: () => { setWholesaleOnly(true); setListingType(undefined); setOffset(0); } },
            { key: "b2b", label: "B2B", on: listingType === "b2b", fn: () => { setListingType("b2b"); setWholesaleOnly(false); setOffset(0); } },
            { key: "c2c", label: "มือสอง C2C", on: listingType === "c2c", fn: () => { setListingType("c2c"); setWholesaleOnly(false); setOffset(0); } },
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={chip.fn}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                chip.on
                  ? chip.key === "wholesale" || chip.key === "b2b"
                    ? "bg-red-600 text-white border-red-600"
                    : chip.key === "c2c"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-orange-600 text-white border-orange-600"
                  : "bg-card border-border hover:bg-muted"
              }`}
            >
              {chip.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline">💬 คุยกับผู้ขาย • โอนนอกแอป</span>
        </div>

        {/* ── Image Search Banner (แสดงเมื่อมีผลวิเคราะห์) ── */}
        {imageAnalysis && (
          <div className="mb-5 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-amber-50 p-4 flex gap-3 items-start">
            {/* Thumbnail */}
            {previewImage && (
              <img
                src={previewImage}
                alt="ค้นหาจากรูป"
                className="w-16 h-16 rounded-xl object-cover shrink-0 border border-border/60 shadow-sm"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-semibold text-primary">AI ระบุสินค้า</span>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  ความมั่นใจ {Math.round(imageAnalysis.confidence * 100)}%
                </span>
              </div>
              <p className="text-sm font-bold text-foreground truncate">{imageAnalysis.productName}</p>
              {imageAnalysis.brand && imageAnalysis.brand !== "ไม่ทราบ" && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {imageAnalysis.brand}{imageAnalysis.model ? ` · ${imageAnalysis.model}` : ""}{imageAnalysis.color ? ` · ${imageAnalysis.color}` : ""}
                </p>
              )}
              {/* Keywords */}
              <div className="flex flex-wrap gap-1 mt-2">
                {imageAnalysis.keywords.slice(0, 5).map((kw, i) => (
                  <button
                    key={i}
                    onClick={() => { setSearchText(kw); setOffset(0); }}
                    className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={clearImageSearch}
              className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* ── Header: Search + Camera + Sort + Filter ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 flex gap-2">
            {/* Search input */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <Input
                placeholder="ค้นหาสินค้า..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setOffset(0); if (imageAnalysis) setImageAnalysis(null); }}
                className="pl-9 pr-3"
              />
            </div>

            {/* Camera button — Image Search */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImageSearchLoading}
              className={`
                relative shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                border border-border/60 transition-all duration-200
                ${isImageSearchLoading
                  ? "bg-primary/10 border-primary/30 cursor-not-allowed"
                  : "bg-card hover:bg-accent hover:border-primary/40 active:scale-95"
                }
              `}
              title="ค้นหาด้วยรูปภาพ (AI)"
            >
              {isImageSearchLoading ? (
                <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
              ) : (
                <Camera className="w-4.5 h-4.5 text-muted-foreground" />
              )}
              {/* Sparkle badge */}
              {!isImageSearchLoading && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center">
                  <Sparkles className="w-2 h-2 text-white" />
                </span>
              )}
            </button>

            {/* Hidden file input — ไม่ใส่ capture เพื่อให้เลือกจาก gallery หรือกล้องได้ */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
            />
          </div>

          {/* Sort selector */}
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortBy); setOffset(0); }}>
            <SelectTrigger className="w-[185px] shrink-0 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
            ตัวกรอง
            {activeFiltersCount > 0 && (
              <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* ── Loading overlay สำหรับ image search ── */}
        {isImageSearchLoading && (
          <div className="mb-6 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-amber-50 p-5 flex items-center gap-4">
            {previewImage && (
              <img src={previewImage} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 border border-border/60" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                <span className="text-sm font-semibold text-foreground">AI กำลังวิเคราะห์รูปภาพ...</span>
              </div>
              <p className="text-xs text-muted-foreground">ระบุสินค้า แบรนด์ รุ่น และค้นหาสินค้าที่ตรงกัน</p>
              {/* Progress bar animation */}
              <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: "60%" }} />
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="bg-card border border-border rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">หมวดหมู่</label>
              <Select
                value={categoryId?.toString() ?? "all"}
                onValueChange={(v) => { setCategoryId(v === "all" ? undefined : parseInt(v)); setOffset(0); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="ทั้งหมด" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {categoriesData?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">สภาพสินค้า</label>
              <Select
                value={condition ?? "all"}
                onValueChange={(v) => { setCondition(v === "all" ? undefined : v); setOffset(0); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="ทั้งหมด" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="new">ใหม่</SelectItem>
                  <SelectItem value="like_new">เหมือนใหม่</SelectItem>
                  <SelectItem value="good">ดี</SelectItem>
                  <SelectItem value="fair">พอใช้</SelectItem>
                  <SelectItem value="poor">ต้องซ่อม</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ราคาต่ำสุด (฿)</label>
              <Input
                type="number"
                placeholder="0"
                value={minPrice}
                onChange={(e) => { setMinPrice(e.target.value); setOffset(0); }}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ราคาสูงสุด (฿)</label>
              <Input
                type="number"
                placeholder="ไม่จำกัด"
                value={maxPrice}
                onChange={(e) => { setMaxPrice(e.target.value); setOffset(0); }}
                className="h-9"
              />
            </div>
            {activeFiltersCount > 0 && (
              <div className="col-span-2 md:col-span-4 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <X className="w-4 h-4 mr-1" /> ล้างตัวกรอง
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
          <button
            onClick={() => { setCategoryId(undefined); setOffset(0); }}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !categoryId ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            ทั้งหมด
          </button>
          {categoriesData?.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategoryId(cat.id); setOffset(0); }}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryId === cat.id ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {data ? `พบ ${data.total} รายการ` : "กำลังโหลด..."}
            {imageAnalysis && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary font-medium">
                <Sparkles className="w-3 h-3" /> ค้นหาด้วย AI
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {sortBy === "smart" && "✨ เรียงตามความสนใจของคุณ"}
            {sortBy === "popular" && "🔥 เรียงตามยอดนิยม"}
            {sortBy === "newest" && "🆕 เรียงตามวันที่ลงล่าสุด"}
            {sortBy === "price_asc" && "ราคาต่ำสุดก่อน"}
            {sortBy === "price_desc" && "ราคาสูงสุดก่อน"}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {imageAnalysis ? (
              <>
                <ImageOff className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">ไม่พบสินค้าที่ตรงกับรูปภาพ</p>
                <p className="text-sm mt-1 mb-4">AI ระบุว่าเป็น "{imageAnalysis.productName}" แต่ยังไม่มีสินค้านี้ในระบบ</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {imageAnalysis.keywords.map((kw, i) => (
                    <button
                      key={i}
                      onClick={() => { setSearchText(kw); setOffset(0); }}
                      className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                    >
                      ค้นหา "{kw}"
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-medium">ไม่พบสินค้า</p>
                <p className="text-sm mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {data?.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Pagination */}
            {data && data.total > limit && (
              <div className="flex justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  ก่อนหน้า
                </Button>
                <span className="flex items-center px-4 text-sm text-muted-foreground">
                  หน้า {Math.floor(offset / limit) + 1} / {Math.ceil(data.total / limit)}
                </span>
                <Button
                  variant="outline"
                  disabled={offset + limit >= data.total}
                  onClick={() => setOffset(offset + limit)}
                >
                  ถัดไป
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
