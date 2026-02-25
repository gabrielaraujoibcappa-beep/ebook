import { GoogleGenAI, Type } from "@google/genai";
import { Ebook, Chapter, Tone, Language } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateCover = async (title: string, subtitle?: string): Promise<string> => {
  const prompt = `You are an elite YouTube thumbnail designer. Your mission is to create a visually stunning, high-impact book cover for an ebook titled "${title}"${subtitle ? ` with the subtitle "${subtitle}"` : ''}. 

CRITICAL RULES:
- NO TEXT. ZERO WORDS. The title and subtitle are for your context only.
- Create a customized, thematic background with depth, movement, and texture.
- Use dramatic lighting, high contrast, and saturated colors.
- The composition must be powerful and professional, like a viral YouTube thumbnail.
- If the theme is technical, use digital particles/code. If entertainment, use explosive colors.
- Integrate symbolic elements suttly but powerfully.
- The image must tell the story of the book through visuals alone.
- Style: Ultra-high quality, sharp details, cinematic feel.`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "3:4",
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate cover image");
};

export const generateOutline = async (title: string, tone: Tone, language: Language, chapterCount: number, videoDescription: string): Promise<string[]> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a detailed table of contents for an ebook titled "${title}". 
    The ebook should have exactly ${chapterCount} chapters.
    The tone should be ${tone} and the language must be ${language}.
    
    Base the content of the ebook on the following video description:
    "${videoDescription}"
    
    Return ONLY a JSON array of strings representing the chapter titles.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse outline:", e);
    return [];
  }
};

export const generateChapterContent = async (
  ebookTitle: string, 
  chapterTitle: string, 
  tone: Tone, 
  language: Language,
  chapterCount: number,
  targetPages: number,
  videoDescription: string,
  previousChapters: { title: string; content: string }[]
): Promise<string> => {
  const wordsPerPage = 250;
  const targetWords = Math.max(500, Math.round((targetPages * wordsPerPage) / chapterCount));
  
  const context = previousChapters.length > 0 
    ? `Context from previous chapters: ${previousChapters.map(c => c.title).join(", ")}`
    : "";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Write a detailed chapter for an ebook.
    Ebook Title: ${ebookTitle}
    Chapter Title: ${chapterTitle}
    Tone: ${tone}
    Language: ${language}
    
    Base the content on this video description:
    "${videoDescription}"
    
    ${context}
    
    Requirements:
    - Target length: approximately ${targetWords} words.
    - Use professional Markdown formatting (headers, lists, bold text).
    - Do not include the chapter title in the body.
    - Focus on depth, practical value, and narrative flow.
    - CRITICAL: Ensure perfect grammar and spelling in ${language}. Avoid repetitive phrases or artificial-sounding transitions.`,
    config: {
      temperature: 0.7,
    }
  });

  return response.text || "";
};
