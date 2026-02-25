import React, { useState, useEffect, useMemo } from 'react';
import { 
  Book, 
  Plus, 
  Download, 
  Settings, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Trash2,
  Play,
  Languages,
  Type as TypeIcon,
  FileDown,
  Sparkles,
  Clock,
  BarChart3,
  RotateCcw,
  Eye,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  X,
  Menu,
  Moon,
  Sun,
  Wand2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Toaster, toast } from 'sonner';
import { Ebook, Chapter, Tone, Language } from './types';
import { generateOutline, generateChapterContent, generateCover } from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STORAGE_KEY = 'ebook_pro_v2_data';

export default function App() {
  const [ebook, setEbook] = useState<Ebook>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved ebook", e);
      }
    }
    return {
      title: '',
      subtitle: '',
      author: '',
      dedication: '',
      videoDescription: '',
      tone: 'Professional',
      language: 'Portuguese',
      chapterCount: 10,
      targetPages: 50,
      chapters: []
    };
  });

  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ebook_theme') === 'dark' || 
        (!localStorage.getItem('ebook_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [currentView, setCurrentView] = useState<'setup' | 'editor'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        return data.chapters.length > 0 ? 'editor' : 'setup';
      } catch (e) {}
    }
    return 'setup';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ebook));
  }, [ebook]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ebook_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ebook_theme', 'light');
    }
  }, [isDarkMode]);

  const activeChapter = ebook.chapters.find(c => c.id === activeChapterId);

  const stats = useMemo(() => {
    const completed = ebook.chapters.filter(c => c.status === 'completed').length;
    const total = ebook.chapters.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const totalWords = ebook.chapters.reduce((acc, c) => acc + (c.content?.split(/\s+/).length || 0), 0);
    return { completed, total, progress, totalWords };
  }, [ebook.chapters]);

  const handleGenerateOutline = async () => {
    if (!ebook.title) {
      toast.error("Please enter a book title first");
      return;
    }
    setIsGeneratingOutline(true);
    const toastId = toast.loading("Generating outline...");
    try {
      const titles = await generateOutline(ebook.title, ebook.tone, ebook.language, ebook.chapterCount, ebook.videoDescription);
      const newChapters: Chapter[] = titles.map((title, index) => ({
        id: Math.random().toString(36).substr(2, 9),
        title,
        content: '',
        status: 'pending'
      }));
      setEbook(prev => ({ ...prev, chapters: newChapters }));
      if (newChapters.length > 0) setActiveChapterId(newChapters[0].id);
      toast.success("Outline generated successfully!", { id: toastId });
    } catch (error) {
      toast.error("Failed to generate outline", { id: toastId });
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleGenerateChapter = async (chapterId: string) => {
    const chapter = ebook.chapters.find(c => c.id === chapterId);
    if (!chapter || chapter.status === 'generating') return;

    setEbook(prev => ({
      ...prev,
      chapters: prev.chapters.map(c => 
        c.id === chapterId ? { ...c, status: 'generating' } : c
      )
    }));

    try {
      const previousChapters = ebook.chapters
        .filter((c, idx) => ebook.chapters.findIndex(ch => ch.id === chapterId) > idx && c.status === 'completed')
        .map(c => ({ title: c.title, content: c.content }));

      const content = await generateChapterContent(
        ebook.title,
        chapter.title,
        ebook.tone,
        ebook.language,
        ebook.chapterCount,
        ebook.targetPages,
        ebook.videoDescription,
        previousChapters
      );

      setEbook(prev => ({
        ...prev,
        chapters: prev.chapters.map(c => 
          c.id === chapterId ? { ...c, content, status: 'completed' } : c
        )
      }));
      toast.success(`Chapter "${chapter.title}" completed!`);
    } catch (error) {
      setEbook(prev => ({
        ...prev,
        chapters: prev.chapters.map(c => 
          c.id === chapterId ? { ...c, status: 'error' } : c
        )
      }));
      toast.error(`Failed to generate "${chapter.title}"`);
    }
  };

  const handleGenerateAll = async () => {
    const pending = ebook.chapters.filter(c => c.status !== 'completed');
    if (pending.length === 0) return;
    
    toast.info(`Starting generation for ${pending.length} chapters...`);
    for (const chapter of ebook.chapters) {
      if (chapter.status !== 'completed') {
        await handleGenerateChapter(chapter.id);
      }
    }
    toast.success("All chapters generated!");
  };

  const handleGenerateCover = async () => {
    if (!ebook.title) {
      toast.error("Please enter a book title first");
      return;
    }
    setIsGeneratingCover(true);
    const toastId = toast.loading("Generating cover image...");
    try {
      const coverUrl = await generateCover(ebook.title, ebook.subtitle);
      setEbook(prev => ({ ...prev, coverImage: coverUrl }));
      toast.success("Cover generated successfully!", { id: toastId });
    } catch (error) {
      toast.error("Failed to generate cover", { id: toastId });
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'epub' | 'docx') => {
    if (stats.completed === 0) {
      toast.error("Generate at least one chapter before exporting");
      return;
    }
    setIsExporting(format);
    const toastId = toast.loading(`Preparing ${format.toUpperCase()}...`);
    try {
      const response = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ebook.title,
          subtitle: ebook.subtitle,
          author: ebook.author,
          dedication: ebook.dedication,
          logo: ebook.logo,
          coverImage: ebook.coverImage,
          chapters: ebook.chapters.filter(c => c.status === 'completed').map(c => ({ title: c.title, content: c.content }))
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ebook.title || 'ebook'}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`${format.toUpperCase()} exported!`, { id: toastId });
      } else {
        throw new Error("Export failed");
      }
    } catch (error) {
      toast.error(`Export failed`, { id: toastId });
    } finally {
      setIsExporting(null);
    }
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all data? This cannot be undone.")) {
      setEbook({
        title: '',
        subtitle: '',
        author: '',
        dedication: '',
        videoDescription: '',
        tone: 'Professional',
        language: 'Portuguese',
        chapterCount: 10,
        targetPages: 50,
        chapters: []
      });
      setActiveChapterId(null);
      toast.success("All data cleared");
    }
  };

  const loadExample = () => {
    setEbook(prev => ({
      ...prev,
      title: 'The Future of Artificial Intelligence',
      author: 'AI Expert',
      videoDescription: 'This video explores how AI is transforming healthcare, education, and the creative industries. We look at large language models, computer vision, and the ethical implications of automation in the next decade.',
      tone: 'Technical',
      language: 'English'
    }));
    toast.success("Example data loaded");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Logo must be smaller than 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEbook(prev => ({ ...prev, logo: reader.result as string }));
        toast.success("Logo uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setEbook(prev => ({ ...prev, logo: undefined }));
    toast.success("Logo removed");
  };

  const getWordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const getReadingTime = (text: string) => Math.ceil(getWordCount(text) / 200);

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden selection:bg-emerald-100 selection:text-emerald-900 relative">
      <Toaster position="top-center" richColors />
      
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Settings */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 flex flex-col transition-all duration-300 transform lg:relative lg:translate-x-0",
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isFocusMode ? "lg:-ml-80" : "lg:ml-0"
      )}>
        <div className="p-6 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-slate-900 dark:bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-slate-200 dark:shadow-none">
                <Book className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight text-slate-900 dark:text-white">Ebook Pro</h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Generator v2</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg transition-all"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => setCurrentView('setup')}
                className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg transition-all"
                title="Project Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button 
                onClick={handleClearAll}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all"
                title="Clear all data"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsMobileSidebarOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {currentView === 'editor' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Progress</h2>
                <span className="text-[10px] font-bold text-emerald-500">{stats.progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.progress}%` }}
                  className="h-full bg-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 dark:bg-zinc-800/50 p-2 rounded-lg border border-slate-100 dark:border-zinc-800">
                  <p className="text-[8px] font-bold text-slate-400 uppercase">Words</p>
                  <p className="text-xs font-bold dark:text-white">{stats.totalWords.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 dark:bg-zinc-800/50 p-2 rounded-lg border border-slate-100 dark:border-zinc-800">
                  <p className="text-[8px] font-bold text-slate-400 uppercase">Chapters</p>
                  <p className="text-xs font-bold dark:text-white">{stats.completed}/{stats.total}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {currentView === 'editor' ? (
            <>
              <div className="px-2 py-2 flex items-center justify-between">
                <h2 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Chapters</h2>
                {ebook.chapters.length > 0 && (
                  <button 
                    onClick={handleGenerateAll}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 uppercase tracking-wider"
                  >
                    Generate All
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {ebook.chapters.map((chapter, index) => (
                  <button
                    key={chapter.id}
                    onClick={() => {
                      setActiveChapterId(chapter.id);
                      setIsMobileSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all group cursor-pointer",
                      activeChapterId === chapter.id 
                        ? "bg-slate-900 dark:bg-emerald-600 text-white shadow-lg shadow-slate-200 dark:shadow-none" 
                        : "hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                    )}
                  >
                    <span className={cn(
                      "text-[10px] font-mono w-5",
                      activeChapterId === chapter.id ? "text-slate-400 dark:text-emerald-200" : "text-slate-400"
                    )}>{(index + 1).toString().padStart(2, '0')}</span>
                    <span className={cn(
                      "flex-1 text-sm font-semibold truncate",
                      activeChapterId === chapter.id ? "text-white" : "text-slate-700 dark:text-zinc-200"
                    )}>
                      {chapter.title}
                    </span>
                    <div className="flex items-center">
                      {chapter.status === 'generating' && <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />}
                      {chapter.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {chapter.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                      {chapter.status === 'pending' && <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-zinc-700 group-hover:bg-slate-300 dark:group-hover:bg-zinc-600 transition-colors" />}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-4">
              <div className="w-12 h-12 bg-slate-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center">
                <Settings className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-bold dark:text-white">Setup Mode</p>
                <p className="text-[10px] text-slate-400 mt-1">Configure your book details in the main area.</p>
              </div>
              {ebook.chapters.length > 0 && (
                <button 
                  onClick={() => setCurrentView('editor')}
                  className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider"
                >
                  Back to Editor
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
          <div className="grid grid-cols-3 gap-2">
            {(['pdf', 'epub', 'docx'] as const).map(format => (
              <button
                key={format}
                onClick={() => handleExport(format)}
                disabled={stats.completed === 0 || !!isExporting}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-slate-900 dark:hover:border-emerald-500 active:scale-95 disabled:opacity-50 transition-all group cursor-pointer shadow-sm hover:shadow-md"
              >
                {isExporting === format ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                ) : (
                  <FileDown className="w-4 h-4 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-emerald-500 transition-colors" />
                )}
                <span className="text-[10px] font-bold uppercase mt-1 text-slate-500 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-emerald-500 tracking-wider transition-colors">{format}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-white dark:bg-zinc-950 relative overflow-hidden">
        {/* Toggle Sidebar Button (Desktop) */}
        <button 
          onClick={() => setIsFocusMode(!isFocusMode)}
          className="hidden lg:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-full shadow-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
        >
          {isFocusMode ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />}
        </button>

        {currentView === 'setup' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-6 sm:p-12 space-y-12">
              <header className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Sparkles className="text-white w-6 h-6" />
                  </div>
                  <h2 className="text-3xl font-bold dark:text-white tracking-tight">Project Information</h2>
                </div>
                <p className="text-slate-500 dark:text-zinc-400">Configure your ebook details to start generating content with AI.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Basic Info Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Basic Details</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold dark:text-zinc-300">Book Title</label>
                        {ebook.title === '' && (
                          <button onClick={loadExample} className="text-[10px] font-bold text-emerald-600 hover:underline">Try Example</button>
                        )}
                      </div>
                      <input 
                        type="text"
                        placeholder="e.g. The Future of AI"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        value={ebook.title}
                        onChange={e => setEbook(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Subtitle (Optional)</label>
                      <input 
                        type="text"
                        placeholder="e.g. A Comprehensive Guide"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        value={ebook.subtitle}
                        onChange={e => setEbook(prev => ({ ...prev, subtitle: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Author Name</label>
                      <input 
                        type="text"
                        placeholder="Your Name"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        value={ebook.author}
                        onChange={e => setEbook(prev => ({ ...prev, author: e.target.value }))}
                      />
                    </div>
                  </div>
                </section>

                {/* Visuals Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <ImageIcon className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Visual Identity</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold dark:text-zinc-300">Brand Logo</label>
                      <div className="h-32 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 flex items-center justify-center relative group overflow-hidden bg-slate-50 dark:bg-zinc-900">
                        {ebook.logo ? (
                          <>
                            <img src={ebook.logo} alt="Logo" className="w-full h-full object-contain p-4" />
                            <button 
                              onClick={() => setEbook(prev => ({ ...prev, logo: undefined }))}
                              className="absolute top-2 right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <label className="flex flex-col items-center gap-2 cursor-pointer">
                            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                            <Plus className="w-6 h-6 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Upload Logo</span>
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold dark:text-zinc-300">Book Cover</label>
                      <div className="h-32 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 flex items-center justify-center relative group overflow-hidden bg-slate-50 dark:bg-zinc-900">
                        {ebook.coverImage ? (
                          <>
                            <img src={ebook.coverImage} alt="Cover" className="w-full h-full object-cover" />
                            <button 
                              onClick={() => setEbook(prev => ({ ...prev, coverImage: undefined }))}
                              className="absolute top-2 right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button 
                            onClick={handleGenerateCover}
                            disabled={isGeneratingCover || !ebook.title}
                            className="flex flex-col items-center gap-2 disabled:opacity-50"
                          >
                            {isGeneratingCover ? (
                              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                            ) : (
                              <Wand2 className="w-6 h-6 text-slate-400" />
                            )}
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Generate Cover</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Context Section */}
                <section className="space-y-6 md:col-span-2">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">AI Context & Personalization</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Video Description / Source Context</label>
                      <textarea 
                        placeholder="Paste a YouTube description or any text to guide the AI..."
                        rows={5}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                        value={ebook.videoDescription}
                        onChange={e => setEbook(prev => ({ ...prev, videoDescription: e.target.value }))}
                      />
                      <p className="text-[10px] text-slate-400">This helps Gemini understand the specific topics and depth you want.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Dedication (Optional)</label>
                      <textarea 
                        placeholder="Who is this book for?"
                        rows={5}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                        value={ebook.dedication}
                        onChange={e => setEbook(prev => ({ ...prev, dedication: e.target.value }))}
                      />
                    </div>
                  </div>
                </section>

                {/* Config Section */}
                <section className="space-y-6 md:col-span-2">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <Settings className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Ebook Configuration</h3>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Chapters</label>
                      <input 
                        type="number"
                        min="1" max="30"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={ebook.chapterCount}
                        onChange={e => setEbook(prev => ({ ...prev, chapterCount: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Target Pages</label>
                      <input 
                        type="number"
                        min="5" max="500"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={ebook.targetPages}
                        onChange={e => setEbook(prev => ({ ...prev, targetPages: parseInt(e.target.value) || 5 }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Tone</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={ebook.tone}
                        onChange={e => setEbook(prev => ({ ...prev, tone: e.target.value as Tone }))}
                      >
                        <option>Professional</option>
                        <option>Creative</option>
                        <option>Academic</option>
                        <option>Conversational</option>
                        <option>Technical</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold dark:text-zinc-300">Language</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={ebook.language}
                        onChange={e => setEbook(prev => ({ ...prev, language: e.target.value as Language }))}
                      >
                        <option>Portuguese</option>
                        <option>English</option>
                        <option>Spanish</option>
                        <option>French</option>
                        <option>German</option>
                      </select>
                    </div>
                  </div>
                </section>
              </div>

              <footer className="pt-12 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-4">
                  {ebook.chapters.length > 0 && (
                    <button 
                      onClick={() => setCurrentView('editor')}
                      className="px-8 py-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold rounded-2xl hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <button 
                  onClick={async () => {
                    await handleGenerateOutline();
                    setCurrentView('editor');
                  }}
                  disabled={!ebook.title || isGeneratingOutline}
                  className="w-full sm:w-auto px-12 py-4 bg-slate-900 dark:bg-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isGeneratingOutline ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {ebook.chapters.length > 0 ? 'Regenerate Outline' : 'Start Ebook Generation'}
                </button>
              </footer>
            </div>
          </div>
        ) : activeChapter ? (
          <>
            <header className="h-20 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-8 lg:px-12 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3 sm:gap-6">
                <button 
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white lg:hidden"
                >
                  <Menu className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="font-bold text-base sm:text-xl text-slate-900 dark:text-white tracking-tight truncate max-w-[150px] sm:max-w-none">{activeChapter.title}</h2>
                  <div className="flex items-center gap-2 sm:gap-4 mt-1">
                    <div className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.1em]",
                      activeChapter.status === 'completed' ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" :
                      activeChapter.status === 'generating' ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 animate-pulse" :
                      "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
                    )}>
                      {activeChapter.status}
                    </div>
                    {activeChapter.content && (
                      <div className="flex items-center gap-2 sm:gap-3 text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {getWordCount(activeChapter.content)} <span className="hidden xs:inline">words</span></span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {getReadingTime(activeChapter.content)} <span className="hidden xs:inline">min</span></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => handleGenerateChapter(activeChapter.id)}
                  disabled={activeChapter.status === 'generating'}
                  className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs sm:text-sm font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-slate-200 dark:shadow-none cursor-pointer"
                >
                  {activeChapter.status === 'generating' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span className="hidden xs:inline">{activeChapter.content ? 'Regenerate' : 'Generate'}</span>
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 sm:p-12 max-w-4xl mx-auto w-full custom-scrollbar">
              <AnimatePresence mode="wait">
                {activeChapter.status === 'generating' ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full space-y-4 text-slate-400 dark:text-zinc-500"
                  >
                    <div className="relative">
                      <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 animate-spin text-emerald-500" />
                      <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-900 dark:text-white">Gemini is writing...</p>
                      <p className="text-xs mt-1">Crafting high-quality content for your book.</p>
                    </div>
                  </motion.div>
                ) : activeChapter.content ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="markdown-body pb-24"
                  >
                    <Markdown>{activeChapter.content}</Markdown>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-zinc-800 space-y-6">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 dark:bg-zinc-900 rounded-3xl flex items-center justify-center">
                      <FileText className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                    <div className="text-center">
                      <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Empty Chapter</p>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-500 mt-1 max-w-xs px-4">Click the generate button above to start writing this chapter with AI.</p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-zinc-800 space-y-8 p-6 sm:p-12 overflow-y-auto">
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="absolute left-4 top-4 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="relative">
              <motion.div 
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 5 }}
                className="w-24 h-24 sm:w-32 sm:h-32 bg-slate-50 dark:bg-zinc-900 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-center shadow-inner"
              >
                <Book className="w-12 h-12 sm:w-16 sm:h-16 text-slate-200 dark:text-zinc-800" />
              </motion.div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-zinc-800 rounded-xl sm:rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 dark:border-zinc-700">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
              </div>
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">Your Ebook Journey Starts Here</h3>
              <p className="text-sm sm:text-slate-500 dark:text-zinc-500 leading-relaxed px-4">
                {ebook.chapters.length === 0 
                  ? "Click the button below to configure your book details and generate an outline with AI."
                  : "Select a chapter from the sidebar to start writing or editing."}
              </p>
              {ebook.chapters.length === 0 ? (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
                  <button 
                    onClick={() => setCurrentView('setup')}
                    className="w-full sm:w-auto px-8 py-4 bg-slate-900 dark:bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-4 h-4" /> Start Setup
                  </button>
                  <button 
                    onClick={loadExample}
                    className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-bold text-slate-900 dark:text-white hover:border-slate-900 dark:hover:border-emerald-500 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" /> Try Example
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setCurrentView('setup')}
                  className="mt-8 px-6 py-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white hover:border-slate-900 dark:hover:border-emerald-500 transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <Settings className="w-4 h-4" /> Edit Project Info
                </button>
              )}
            </div>
            
            {stats.totalWords > 0 && (
              <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full max-w-lg mt-12 pt-12 border-t border-slate-100 dark:border-zinc-800">
                <div className="text-center">
                  <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Chapters</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.completed}/{stats.total}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Total Words</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.totalWords.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Progress</p>
                  <p className="text-lg sm:text-2xl font-bold text-emerald-500">{stats.progress}%</p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
