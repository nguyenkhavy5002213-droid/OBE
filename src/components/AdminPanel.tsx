import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Link as LinkIcon, CheckCircle2, X, AlertCircle, RefreshCw, BookOpen, Plus, Save } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

interface AdminPanelProps {
  onClose: () => void;
}

interface Subject {
  id: string;
  name: string;
  sheetUrl: string;
  docUrl: string;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const { isAdmin } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSheetUrl, setNewSheetUrl] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ count: number; emails: string[] } | null>(null);
  const [activeUsers, setActiveUsers] = useState<{ email: string; lastActive: number }[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'whitelist' | 'active'>('whitelist');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    loadSubjects();
    fetchActiveUsers();
    const interval = setInterval(fetchActiveUsers, 10000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const loadSubjects = async () => {
    try {
      const res = await fetch('/api/subjects');
      const data = await res.json();
      if (data.subjects) {
        setSubjects(data.subjects);
        if (data.subjects.length > 0 && !selectedSubjectId) {
          handleSelectSubject(data.subjects[0].id, data.subjects);
        } else if (selectedSubjectId) {
          handleSelectSubject(selectedSubjectId, data.subjects);
        }
      }
    } catch (error) {
      console.error("Error loading subjects:", error);
    }
  };

  const handleSelectSubject = (id: string, subjectList: Subject[] = subjects) => {
    setSelectedSubjectId(id);
    const subject = subjectList.find(s => s.id === id);
    if (subject) {
      setSheetUrl(subject.sheetUrl || '');
      setDocUrl(subject.docUrl || '');
      fetchEmails(id);
    }
  };

  const fetchActiveUsers = async () => {
    try {
      const authUser = localStorage.getItem('authUser');
      if (!authUser) return;
      const { email } = JSON.parse(authUser);
      
      const res = await fetch('/api/admin/active-users', {
        headers: { 'x-admin-email': email }
      });
      const data = await res.json();
      if (data.activeUsers) {
        setActiveUsers(data.activeUsers);
      }
    } catch (error) {
      console.error("Error fetching active users:", error);
    }
  };

  const fetchEmails = async (subjectId: string = selectedSubjectId) => {
    if (!subjectId) return;
    setIsTesting(true);
    try {
      const res = await fetch(`/api/settings/emails?subjectId=${subjectId}`);
      const data = await res.json();
      if (data.emails) {
        setTestResult({
          count: data.emails.length,
          emails: data.emails
        });
      }
    } catch (error) {
      console.error("Error fetching emails:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const safeJsonParse = (text: string) => {
    try {
      // Clean potential markdown formatting
      const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON Parse Error. Raw text length:", text.length);
      console.error("Raw text snippet:", text.substring(0, 200) + "...");
      console.error("End of text snippet:", text.slice(-200));
      
      // Check if it looks truncated
      if (text.length > 0 && !text.trim().endsWith('}')) {
        throw new Error("Dữ liệu AI bị ngắt quãng do quá dài. Vui lòng thử lại hoặc chia nhỏ nội dung.");
      }
      throw e;
    }
  };

  const handleAISync = async () => {
    if (!selectedSubjectId || !docUrl) {
      alert("Vui lòng nhập Link Google Docx để đồng bộ nội dung.");
      return;
    }
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      const authUser = localStorage.getItem('authUser');
      const { email } = JSON.parse(authUser || '{}');
      
      // 1. Fetch raw text and existing content summary from server
      const fetchRes = await fetch(`/api/subjects/sync/${selectedSubjectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docUrl, adminEmail: email })
      });
      
      if (!fetchRes.ok) {
        const err = await fetchRes.json();
        throw new Error(err.error || 'Failed to fetch raw text');
      }
      
      const { rawText, existingChaptersSummary, subjectName } = await fetchRes.json();
      
      if (!rawText || rawText.trim().length < 10) {
        throw new Error('Dữ liệu lấy được quá ngắn hoặc trống.');
      }

      // 2. Fetch FULL existing content to merge later
      const fullContentRes = await fetch(`/api/subjects/content/${selectedSubjectId}`);
      const fullContentData = await fullContentRes.json();
      const existingChapters = fullContentData.chapters || [];
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY chưa được thiết lập.');
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";

      // STEP 1: Identify New or Updated Chapters
      const identifyPrompt = `
        Subject: ${subjectName}
        Existing Chapters: ${JSON.stringify(existingChaptersSummary)}
        
        Task: Analyze the raw text from the provided Google Document/Sheet. 
        1. Identify all chapters/modules present in the text. (Note: These might be organized as sections, headings, or even different sheets if the source is a spreadsheet).
        2. Compare these identified chapters with the "Existing Chapters" list provided above.
        3. Determine which chapters are BRAND NEW or have significant UPDATES that require re-generation.
        
        Return a JSON object with:
        - "toProcess": Array of {id, title, status} where status is "new" or "update".
        
        Raw Text (beginning):
        ${rawText.substring(0, 15000)}
      `;

      const idResult = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: identifyPrompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              toProcess: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.NUMBER },
                    title: { type: Type.STRING },
                    status: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const { toProcess } = safeJsonParse(idResult.text || "{}");
      
      if (!toProcess || toProcess.length === 0) {
        alert("Không có chương mới hoặc thay đổi nào được phát hiện.");
        setIsSyncing(false);
        return;
      }

      console.log("Chapters to process:", toProcess);

      // STEP 2: Process only the identified chapters
      const processedChapters = [];
      for (const chapter of toProcess) {
        console.log(`Processing ${chapter.status} Chapter ${chapter.id}: ${chapter.title}`);
        
        // 2a. Generate Theory
        const theoryPrompt = `
          Subject: ${subjectName}
          Chapter ${chapter.id}: "${chapter.title}"
          Task: Perform a detailed study and write a comprehensive "theory" section in Markdown.
          
          Instructions:
          - Break down the content into logical sub-sections (id, title, content).
          - Ensure the content is educational, detailed, and covers all key concepts mentioned in the raw text for this chapter.
          - Use professional and clear language (bilingual English/Vietnamese if possible, or as per source).
          - Format must match existing chapters exactly.
          
          Raw Text Source:
          ${rawText}
        `;

        const theoryResult = await ai.models.generateContent({
          model,
          contents: [{ parts: [{ text: theoryPrompt }] }],
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
            temperature: 0.1,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                theory: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      content: { type: Type.STRING },
                      chapter: { type: Type.NUMBER }
                    }
                  }
                }
              }
            }
          }
        });

        const { theory } = safeJsonParse(theoryResult.text || "{}");

        // 2b. Generate Quiz in 10 batches of 5 to avoid truncation
        const quiz = [];
        const TOTAL_QUESTIONS = 50;
        const BATCH_SIZE = 5;
        const NUM_BATCHES = TOTAL_QUESTIONS / BATCH_SIZE;

        for (let batch = 0; batch < NUM_BATCHES; batch++) {
          const start = batch * BATCH_SIZE + 1;
          const end = (batch + 1) * BATCH_SIZE;
          console.log(`  Generating Quiz Batch ${batch + 1}/${NUM_BATCHES} (Questions ${start}-${end})`);
          
          const quizPrompt = `
            Subject: ${subjectName}
            Chapter ${chapter.id}: "${chapter.title}"
            Task: Create ${BATCH_SIZE} high-quality bilingual (English/Vietnamese) MCQs (Questions ${start} to ${end}).
            
            Instructions:
            - Each question must have exactly 4 options.
            - Format: { "questions": [ { "id": number, "question": "Eng / Viet", "options": ["A", "B", "C", "D"], "answer": index, "explanation": "Eng / Viet", "relatedSectionId": "string", "chapter": ${chapter.id} } ] }
            - Use the provided raw text as the source.
            
            Raw Text:
            ${rawText.substring(0, 40000)}
          `;

          const quizResult = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: quizPrompt }] }],
            config: {
              responseMimeType: "application/json",
              maxOutputTokens: 8192, // Use max tokens to be safe
              temperature: 0.1,
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.NUMBER },
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 4, maxItems: 4 },
                        answer: { type: Type.NUMBER },
                        explanation: { type: Type.STRING },
                        relatedSectionId: { type: Type.STRING },
                        chapter: { type: Type.NUMBER }
                      },
                      required: ["id", "question", "options", "answer", "explanation", "relatedSectionId", "chapter"]
                    }
                  }
                },
                required: ["questions"]
              }
            }
          });

          const { questions } = safeJsonParse(quizResult.text || "{}");
          if (questions && Array.isArray(questions)) {
            quiz.push(...questions);
          }
        }

        processedChapters.push({
          id: chapter.id,
          title: chapter.title,
          theory,
          quiz
        });
      }

      // STEP 3: Merge and Save
      // Create a map of existing chapters for easy replacement
      const chapterMap = new Map();
      existingChapters.forEach((ch: any) => chapterMap.set(ch.id, ch));
      
      // Add/Update processed chapters
      processedChapters.forEach(ch => chapterMap.set(ch.id, ch));
      
      // Convert back to array and sort
      const finalChapters = Array.from(chapterMap.values()).sort((a, b) => a.id - b.id);

      const saveRes = await fetch(`/api/subjects/save-content/${selectedSubjectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { chapters: finalChapters }, adminEmail: email })
      });
      
      if (saveRes.ok) {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error("Sync error:", error);
      setSyncStatus('error');
      alert(error instanceof Error ? error.message : "Có lỗi xảy ra khi đồng bộ AI.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) return;

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const res = await fetch('/api/settings/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sheetUrl, 
          docUrl,
          subjectId: selectedSubjectId 
        })
      });
      if (res.ok) {
        setSaveStatus('success');
        await loadSubjects(); // Refresh subjects list
        await fetchEmails(selectedSubjectId); // Refresh list after save
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error("Error saving sheet ID:", error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectId || !newSubjectName) return;
    
    setIsSaving(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: newSubjectId, 
          name: newSubjectName,
          sheetUrl: newSheetUrl,
          docUrl: newDocUrl
        })
      });
      if (res.ok) {
        await loadSubjects();
        handleSelectSubject(newSubjectId);
        setIsAddingSubject(false);
        setNewSubjectId('');
        setNewSubjectName('');
        setNewSheetUrl('');
        setNewDocUrl('');
      }
    } catch (error) {
      console.error("Error adding subject:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredEmails = testResult?.emails.filter(email => 
    email.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!isAdmin) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Bảng Quản Trị
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Quản lý hệ thống và theo dõi người dùng.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 bg-white dark:bg-slate-800">
          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'whitelist'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Quản lý Môn học & Whitelist
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'active'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Người dùng đang truy cập
            {activeUsers.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] rounded-full">
                {activeUsers.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {activeTab === 'whitelist' ? (
            <div className="flex flex-col md:flex-row gap-6">
              {/* Sidebar: Subjects List */}
              <div className="w-full md:w-1/3 border-r border-slate-200 dark:border-slate-700 pr-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> Môn học
                  </h3>
                  <button
                    onClick={() => setIsAddingSubject(!isAddingSubject)}
                    className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {isAddingSubject && (
                  <form onSubmit={handleAddSubject} className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Mã môn (vd: math)"
                        value={newSubjectId}
                        onChange={(e) => setNewSubjectId(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Tên môn học"
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Link Google Sheet (Whitelist)"
                        value={newSheetUrl}
                        onChange={(e) => setNewSheetUrl(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        placeholder="Link Google Docx (Nội dung)"
                        value={newDocUrl}
                        onChange={(e) => setNewDocUrl(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <div className="flex gap-2">
                        <button type="submit" disabled={isSaving} className="flex-1 bg-indigo-600 text-white text-xs py-1.5 rounded-md hover:bg-indigo-700">
                          {isSaving ? 'Đang lưu...' : 'Thêm'}
                        </button>
                        <button type="button" onClick={() => setIsAddingSubject(false)} className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs py-1.5 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">
                          Hủy
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="space-y-1">
                  {subjects.map(subject => (
                    <button
                      key={subject.id}
                      onClick={() => handleSelectSubject(subject.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedSubjectId === subject.id
                          ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {subject.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Content: Subject Config */}
              <div className="w-full md:w-2/3">
                {selectedSubjectId ? (
                  <>
                    <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-bold mb-1">Cấu hình cho môn: {subjects.find(s => s.id === selectedSubjectId)?.name}</p>
                        <ol className="list-decimal pl-4 space-y-1">
                          <li>Tạo một file Google Sheet và nhập danh sách email.</li>
                          <li>Bấm nút <strong>Chia sẻ (Share)</strong>.</li>
                          <li>Đổi quyền truy cập chung thành <strong>Bất kỳ ai có liên kết</strong> (Người xem).</li>
                          <li>Copy link của Sheet đó và dán vào ô bên dưới.</li>
                        </ol>
                      </div>
                    </div>

                    <form onSubmit={handleSaveSheet} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Link Google Sheet (Whitelist)
                          </label>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <LinkIcon className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                              type="text"
                              value={sheetUrl}
                              onChange={(e) => setSheetUrl(e.target.value)}
                              placeholder="https://docs.google.com/spreadsheets/d/..."
                              className="block w-full pl-10 pr-10 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all sm:text-sm"
                            />
                            {sheetUrl && (
                              <button
                                type="button"
                                onClick={() => setSheetUrl('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Link Google Docx (Nội dung)
                          </label>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <BookOpen className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                              type="text"
                              value={docUrl}
                              onChange={(e) => setDocUrl(e.target.value)}
                              placeholder="https://docs.google.com/document/d/..."
                              className="block w-full pl-10 pr-10 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all sm:text-sm"
                            />
                            {docUrl && (
                              <button
                                type="button"
                                onClick={() => setDocUrl('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                        >
                          {isSaving ? 'Đang lưu...' : 'Lưu Cấu Hình'}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => fetchEmails(selectedSubjectId)}
                          disabled={isTesting || !sheetUrl}
                          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-medium transition-colors disabled:opacity-50"
                        >
                          {isTesting ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Làm mới whitelist'}
                        </button>

                        <button
                          type="button"
                          onClick={handleAISync}
                          disabled={isSyncing || !docUrl}
                          className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
                            syncStatus === 'success' 
                              ? 'bg-emerald-500 text-white' 
                              : syncStatus === 'error'
                              ? 'bg-rose-500 text-white'
                              : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:shadow-lg hover:scale-105'
                          } disabled:opacity-50`}
                        >
                          {isSyncing ? (
                            <><RefreshCw className="w-5 h-5 animate-spin" /> Đang quét AI...</>
                          ) : syncStatus === 'success' ? (
                            <><CheckCircle2 className="w-5 h-5" /> Đã xong!</>
                          ) : (
                            <><RefreshCw className="w-5 h-5" /> Đồng bộ AI (Docs/Sheet)</>
                          )}
                        </button>
                      </div>
                    </form>

                    {saveStatus === 'success' && (
                      <div className="mt-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                        <CheckCircle2 className="w-5 h-5" />
                        Đã lưu cấu hình thành công!
                      </div>
                    )}

                    {testResult && (
                      <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Danh sách email hợp lệ ({testResult.count})
                          </h3>
                          <div className="relative w-48">
                            <input
                              type="text"
                              placeholder="Tìm email..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 max-h-64 overflow-y-auto">
                          {filteredEmails.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {filteredEmails.map((email, idx) => (
                                <span key={idx} className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-100 dark:border-slate-700">
                                  {email}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                              {searchTerm ? 'Không tìm thấy email nào khớp.' : 'Danh sách trống.'}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">
                    Vui lòng chọn hoặc thêm một môn học
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Phiên đăng nhập đang hoạt động ({activeUsers.length})
                </h3>
                <button 
                  onClick={fetchActiveUsers}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Làm mới"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {activeUsers.length > 0 ? (
                  activeUsers.map((u, idx) => {
                    const lastActiveDate = new Date(u.lastActive);
                    const isOnline = Date.now() - u.lastActive < 60000; // Active in last 1 min
                    
                    return (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-400'}`}></div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{u.email}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Hoạt động lần cuối: {lastActiveDate.toLocaleTimeString()} {lastActiveDate.toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isOnline ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                          {isOnline ? 'TRỰC TUYẾN' : 'NGOẠI TUYẾN'}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Không có người dùng nào đang hoạt động.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
