import { invokeLLM } from "./_core/llm";

/**
 * OCR: อ่านข้อความในรูป (ยี่ห้อ, รุ่น, ข้อมูล)
 */
export async function extractTextFromImage(imageUrl: string): Promise<{
  text: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  confidence: number;
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณเป็น OCR AI ที่อ่านข้อความในรูปภาพ ตอบเป็น JSON เท่านั้น
อ่านข้อความทั้งหมดที่เห็นในรูป รวมถึง:
- ยี่ห้อ (Brand)
- รุ่น (Model)
- หมายเลขซีเรียล (Serial Number)
- ข้อความอื่นๆ`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url" as const,
              image_url: { url: imageUrl, detail: "high" as const },
            },
            {
              type: "text" as const,
              text: `อ่านข้อความในรูป ตอบ JSON:
{
  "text": "ข้อความทั้งหมดที่อ่านได้",
  "brand": "ยี่ห้อ (ถ้ามี)",
  "model": "รุ่น (ถ้ามี)",
  "serialNumber": "หมายเลขซีเรียล (ถ้ามี)",
  "confidence": 0.9
}`,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    const raw = typeof content === "string" ? content : JSON.stringify(content);
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw);

    return {
      text: parsed.text || "",
      brand: parsed.brand,
      model: parsed.model,
      serialNumber: parsed.serialNumber,
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error("OCR Error:", error);
    return { text: "", confidence: 0 };
  }
}

/**
 * Color Analysis: วิเคราะห์สีของสินค้า
 */
export async function analyzeProductColors(imageUrl: string): Promise<{
  primaryColor: string;
  secondaryColors: string[];
  colorKeywords: string[];
  confidence: number;
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณเป็น Color Analysis AI ที่วิเคราะห์สีของสินค้า ตอบเป็น JSON เท่านั้น
วิเคราะห์สีหลัก สีรอง และคำศัพท์ที่เกี่ยวกับสี`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url" as const,
              image_url: { url: imageUrl, detail: "high" as const },
            },
            {
              type: "text" as const,
              text: `วิเคราะห์สีของสินค้า ตอบ JSON:
{
  "primaryColor": "สีหลัก (เช่น แดง, น้ำเงิน, ดำ)",
  "secondaryColors": ["สีรอง 1", "สีรอง 2"],
  "colorKeywords": ["คำศัพท์สี 1", "คำศัพท์สี 2", "คำศัพท์สี 3"],
  "confidence": 0.9
}`,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    const raw = typeof content === "string" ? content : JSON.stringify(content);
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw);

    return {
      primaryColor: parsed.primaryColor || "ไม่ทราบ",
      secondaryColors: parsed.secondaryColors || [],
      colorKeywords: parsed.colorKeywords || [],
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error("Color Analysis Error:", error);
    return {
      primaryColor: "ไม่ทราบ",
      secondaryColors: [],
      colorKeywords: [],
      confidence: 0,
    };
  }
}

/**
 * Embedding Search: สร้าง text embedding สำหรับค้นหาคล้ายกัน
 * (ใช้ Vision AI สร้าง semantic representation)
 */
export async function createSemanticEmbedding(text: string): Promise<{
  embedding: number[];
  semanticKeywords: string[];
  confidence: number;
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณเป็น Semantic Analysis AI ที่สร้าง semantic keywords สำหรับค้นหา ตอบเป็น JSON เท่านั้น
สร้างคำศัพท์ที่เกี่ยวข้องทั้งภาษาไทย อังกฤษ ชื่อย่อ เพื่อให้ค้นหาได้แม้ผู้ใช้พิมพ์ต่างกัน`,
        },
        {
          role: "user",
          content: `สร้าง semantic keywords สำหรับค้นหา: "${text}"
ตอบ JSON:
{
  "semanticKeywords": ["คำศัพท์ 1", "คำศัพท์ 2", "คำศัพท์ 3", ...],
  "confidence": 0.9
}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    const raw = typeof content === "string" ? content : JSON.stringify(content);
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw);

    // สร้าง simple embedding จาก keywords (ใช้ hash ของ keywords)
    const keywords = parsed.semanticKeywords || [];
    const embedding = keywords.map((k: string) => {
      let hash = 0;
      for (let i = 0; i < k.length; i++) {
        const char = k.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return hash / 2147483647; // Normalize to [-1, 1]
    });

    return {
      embedding: embedding.slice(0, 10), // Limit to 10 dimensions
      semanticKeywords: keywords,
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error("Semantic Embedding Error:", error);
    return {
      embedding: [],
      semanticKeywords: [],
      confidence: 0,
    };
  }
}

/**
 * Calculate similarity between two embeddings (Cosine Similarity)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;

  const minLen = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLen; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Combine all analyses for enhanced search
 */
export async function enhancedImageAnalysis(imageUrl: string): Promise<{
  ocr: Awaited<ReturnType<typeof extractTextFromImage>>;
  colors: Awaited<ReturnType<typeof analyzeProductColors>>;
  embedding: Awaited<ReturnType<typeof createSemanticEmbedding>>;
  searchKeywords: string[];
}> {
  const [ocr, colors, embedding] = await Promise.all([
    extractTextFromImage(imageUrl),
    analyzeProductColors(imageUrl),
    createSemanticEmbedding(imageUrl),
  ]);

  // รวม keywords ทั้งหมด
  const searchKeywords = [
    ...colors.colorKeywords,
    ...embedding.semanticKeywords,
    ocr.brand,
    ocr.model,
  ].filter((k): k is string => typeof k === "string" && k.trim().length > 0);

  return {
    ocr,
    colors,
    embedding,
    searchKeywords: Array.from(new Set(searchKeywords)), // Remove duplicates
  };
}
