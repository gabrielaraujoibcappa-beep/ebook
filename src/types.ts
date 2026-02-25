export type Tone = 'Professional' | 'Creative' | 'Academic' | 'Conversational' | 'Technical';
export type Language = 'Portuguese' | 'English' | 'Spanish' | 'French' | 'German';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
}

export interface Ebook {
  title: string;
  subtitle?: string;
  author: string;
  dedication?: string;
  videoDescription: string;
  logo?: string; // Base64 string
  coverImage?: string; // Base64 string
  tone: Tone;
  language: Language;
  chapterCount: number;
  targetPages: number;
  chapters: Chapter[];
}
