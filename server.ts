import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nguyenkhavy5002213@gmail.com';
const DATA_FILE = path.join(process.cwd(), 'data.json');
const CONTENT_FILE = path.join(process.cwd(), 'subjects_content.json');

async function readContent() {
  try {
    const data = await fs.readFile(CONTENT_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

async function writeContent(data: any) {
  await fs.writeFile(CONTENT_FILE, JSON.stringify(data, null, 2));
}

async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    let parsed = JSON.parse(data);
    
    // Migrate old data structure to new one
    if (parsed.sheetUrl !== undefined && !parsed.subjects) {
      parsed.subjects = {
        "obe": {
          name: "Organizational Behavior (OBE)",
          sheetUrl: parsed.sheetUrl
        },
        "ibm": {
          name: "International Business Management (IBM)",
          sheetUrl: ""
        }
      };
      delete parsed.sheetUrl;
      await writeData(parsed);
    } else if (!parsed.subjects) {
      parsed.subjects = {
        "obe": { name: "Organizational Behavior (OBE)", sheetUrl: "" },
        "ibm": { name: "International Business Management (IBM)", sheetUrl: "" }
      };
    }

    // Migrate old session format if needed
    if (parsed.sessions && Object.keys(parsed.sessions).length > 0) {
      const firstSession = Object.values(parsed.sessions)[0];
      if (typeof firstSession === 'string') {
        console.log('Old session format detected, clearing sessions...');
        parsed.sessions = {};
        await writeData(parsed);
      }
    }

    return parsed;
  } catch (e) {
    return { 
      subjects: {
        "obe": { name: "Organizational Behavior (OBE)", sheetUrl: "" },
        "ibm": { name: "International Business Management (IBM)", sheetUrl: "" }
      }, 
      sessions: {} 
    };
  }
}

async function writeData(data: any) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Caching Mechanism for Google Sheet ---
let cachedEmails: Record<string, string[]> = {};
let lastFetchTime: Record<string, number> = {};
const CACHE_DURATION = 30 * 1000; // Cache for 30 seconds to avoid rate limits but stay responsive

async function getAllowedEmails(subjectId: string, sheetUrl: string): Promise<string[]> {
  if (!sheetUrl) return [];
  
  const now = Date.now();
  if (lastFetchTime[subjectId] && now - lastFetchTime[subjectId] < CACHE_DURATION) {
    return cachedEmails[subjectId] || [];
  }

  try {
    let fetchUrl = '';
    const dMatch = sheetUrl.match(/\/d\/(.*?)(?:\/|$|\?)/);
    const eMatch = sheetUrl.match(/\/d\/e\/(.*?)(?:\/|$|\?)/);
    
    if (sheetUrl.includes('docs.google.com/document')) {
      if (dMatch) {
        fetchUrl = `https://docs.google.com/document/d/${dMatch[1]}/export?format=txt`;
      }
    } else if (eMatch) {
      // Published to web format
      fetchUrl = `https://docs.google.com/spreadsheets/d/e/${eMatch[1]}/pub?output=csv&t=${now}`;
    } else if (dMatch) {
      // Standard shared link format
      fetchUrl = `https://docs.google.com/spreadsheets/d/${dMatch[1]}/gviz/tq?tqx=out:csv&t=${now}`;
    }

    if (fetchUrl) {
      console.log(`Fetching emails for ${subjectId} from:`, fetchUrl);
      const response = await fetch(fetchUrl);
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          console.error(`Google resource for ${subjectId} is not public or URL is incorrect (returned HTML)`);
          return cachedEmails[subjectId] || [];
        }
        
        const text = await response.text();
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const matches = text.toLowerCase().match(emailRegex) || [];
        const uniqueEmails = [...new Set(matches.map(e => e.trim()))];
        
        console.log(`Successfully fetched ${uniqueEmails.length} unique emails for ${subjectId}.`);
        cachedEmails[subjectId] = uniqueEmails;
        lastFetchTime[subjectId] = now;
        return uniqueEmails;
      } else {
        console.error(`Fetch failed for ${subjectId} with status: ${response.status}. Ensure the resource is shared as "Anyone with the link can view".`);
      }
    }
 else {
      console.error(`Could not extract Sheet ID from URL for ${subjectId}:`, sheetUrl);
    }
  } catch (error) {
    console.error(`Error fetching sheet for ${subjectId}:`, error);
  }
  return cachedEmails[subjectId] || [];
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get('/api/keep-alive', (req, res) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
  });

  app.get('/api/subjects/content/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const content = await readContent();
      res.json({ content: content[id] || null });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/subjects/sync/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { docUrl, adminEmail } = req.body;

      if (adminEmail !== ADMIN_EMAIL && adminEmail !== 'nguyenkhavy5002213@gmail.com') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const data = await readData();
      const subject = data.subjects[id];
      const url = docUrl || subject?.docUrl;

      if (!url) return res.status(400).json({ error: 'No Content URL (Doc/Sheet) provided' });

      // 1. Fetch raw data from Google Docs or Sheets
      let rawText = "";
      console.log(`Attempting to fetch raw text for ${id} from URL: ${url}`);

      if (url.includes('docs.google.com/document')) {
        const docId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
        if (!docId) throw new Error('Could not extract Document ID from URL');
        
        const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
        console.log(`Fetching Doc from: ${exportUrl}`);
        const response = await fetch(exportUrl);
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error('Tài liệu Google Doc không được chia sẻ công khai. Vui lòng chọn "Bất kỳ ai có liên kết đều có thể xem".');
          }
          throw new Error(`Failed to fetch Google Doc content (Status: ${response.status})`);
        }
        rawText = await response.text();
      } else if (url.includes('docs.google.com/spreadsheets')) {
        const sheetId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
        if (!sheetId) throw new Error('Could not extract Sheet ID from URL');
        
        // Try multiple export formats for robustness
        const exportUrls = [
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
        ];

        let lastError = null;
        for (const exportUrl of exportUrls) {
          try {
            console.log(`Trying Sheet export URL: ${exportUrl}`);
            const response = await fetch(exportUrl);
            if (response.ok) {
              const text = await response.text();
              if (text && !text.includes('<!DOCTYPE html>')) {
                rawText = text;
                break;
              }
            } else if (response.status === 401 || response.status === 403) {
              lastError = 'Tài liệu Google Sheet không được chia sẻ công khai. Vui lòng chọn "Bất kỳ ai có liên kết đều có thể xem".';
            }
          } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
          }
        }

        if (!rawText) {
          throw new Error(lastError || 'Không thể lấy dữ liệu từ Google Sheet. Vui lòng kiểm tra quyền chia sẻ.');
        }
      } else {
        throw new Error('Unsupported URL format');
      }

      const currentContent = await readContent();
      const existingChapters = currentContent[id]?.chapters || [];

      res.json({ 
        success: true, 
        rawText, 
        existingChaptersSummary: existingChapters.map((c: any) => ({ id: c.id, title: c.title })),
        subjectName: subject?.name || id
      });
    } catch (e) {
      console.error('Fetch Error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to fetch document content' });
    }
  });

  app.post('/api/subjects/save-content/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content, adminEmail } = req.body;

      if (adminEmail !== ADMIN_EMAIL && adminEmail !== 'nguyenkhavy5002213@gmail.com') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const allContent = await readContent();
      allContent[id] = content;
      await writeContent(allContent);

      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/subjects', async (req, res, next) => {
    try {
      const data = await readData();
      const subjects = Object.keys(data.subjects).map(id => ({
        id,
        name: data.subjects[id].name,
        sheetUrl: data.subjects[id].sheetUrl,
        docUrl: data.subjects[id].docUrl || ''
      }));
      res.json({ subjects });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/subjects', async (req, res, next) => {
    try {
      const { id, name, sheetUrl, docUrl } = req.body;
      if (!id || !name) {
        return res.status(400).json({ error: 'ID and name are required' });
      }
      
      const data = await readData();
      data.subjects[id] = {
        name,
        sheetUrl: sheetUrl || (data.subjects[id] ? data.subjects[id].sheetUrl : ''),
        docUrl: docUrl || (data.subjects[id] ? data.subjects[id].docUrl : '')
      };
      await writeData(data);
      
      res.json({ success: true, subject: { id, ...data.subjects[id] } });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/settings/emails', async (req, res, next) => {
    try {
      const subjectId = req.query.subjectId as string || 'obe';
      const data = await readData();
      const subject = data.subjects[subjectId];
      if (!subject || !subject.sheetUrl) return res.json({ emails: [] });
      const emails = await getAllowedEmails(subjectId, subject.sheetUrl);
      res.json({ emails });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/settings/sheet', async (req, res, next) => {
    try {
      const subjectId = req.query.subjectId as string || 'obe';
      const data = await readData();
      const subject = data.subjects[subjectId];
      res.json({ 
        sheetUrl: subject ? subject.sheetUrl : '',
        docUrl: subject ? subject.docUrl : ''
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/settings/sheet', async (req, res, next) => {
    try {
      const { sheetUrl, docUrl, subjectId = 'obe' } = req.body;
      const data = await readData();
      if (!data.subjects[subjectId]) {
        return res.status(404).json({ error: 'Subject not found' });
      }
      if (sheetUrl !== undefined) data.subjects[subjectId].sheetUrl = sheetUrl;
      if (docUrl !== undefined) data.subjects[subjectId].docUrl = docUrl;
      await writeData(data);
      
      // Invalidate cache when sheet URL changes
      if (sheetUrl !== undefined) lastFetchTime[subjectId] = 0;
      
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });


  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { email, subjectId } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });
      if (!subjectId) return res.status(400).json({ error: 'Subject ID is required' });
      
      const normalizedEmail = email.toLowerCase().trim();
      const adminEmails = [
        ADMIN_EMAIL.toLowerCase().trim(),
        'nguyenkhavy5002213@gmail.com'
      ];
      const isAdmin = adminEmails.includes(normalizedEmail);
      let isAllowed = isAdmin;

      const data = await readData();
      const subject = data.subjects[subjectId];

      if (!subject) {
        return res.status(404).json({ error: 'Môn học không tồn tại.' });
      }

      if (!isAdmin) {
        if (!subject.sheetUrl) {
          console.log(`Login denied for ${normalizedEmail} on ${subjectId}: Sheet URL not configured.`);
          return res.json({ success: false, error: 'Hệ thống chưa được cấu hình danh sách email cho môn học này. Vui lòng liên hệ Quản trị viên.' });
        }
        
        try {
          const allowedEmails = await getAllowedEmails(subjectId, subject.sheetUrl);
          isAllowed = allowedEmails.includes(normalizedEmail);
          
          if (!isAllowed) {
            console.log(`Login denied for ${normalizedEmail} on ${subjectId}: Not in sheet. Sheet has ${allowedEmails.length} emails.`);
            
            // Check if sheet fetch returned 0 emails (likely a public access issue)
            if (allowedEmails.length === 0) {
              return res.json({ 
                success: false, 
                error: 'Không thể tải danh sách email từ Google Sheet. Vui lòng đảm bảo Sheet đã được chia sẻ ở chế độ "Bất kỳ ai có liên kết" (Anyone with the link can view).' 
              });
            }
          }
        } catch (error) {
          console.error('Error during allowed emails check:', error);
          return res.json({ success: false, error: 'Lỗi khi kiểm tra quyền truy cập. Vui lòng thử lại sau.' });
        }
      }

      if (!isAllowed) {
        return res.json({ success: false, error: 'Email của bạn chưa có trong danh sách được phép truy cập môn học này. Vui lòng liên hệ Quản trị viên.' });
      }

      // Generate session token to enforce 1-device policy
      const token = Date.now().toString(36) + Math.random().toString(36).substring(2);
      if (!data.sessions) data.sessions = {};
      
      // Store session per subject
      const sessionKey = `${normalizedEmail}_${subjectId}`;
      data.sessions[sessionKey] = {
        token,
        lastActive: Date.now(),
        subjectId
      };
      await writeData(data);

      res.json({ success: true, email: normalizedEmail, token, isAdmin, subjectId, subjectName: subject.name });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/auth/verify', async (req, res, next) => {
    try {
      const { email, token, subjectId } = req.body;
      if (!email || !token || !subjectId) return res.json({ valid: false });
      
      const normalizedEmail = email.toLowerCase().trim();
      const data = await readData();
      const sessionKey = `${normalizedEmail}_${subjectId}`;
      
      // 1. Check 1-device policy (session token match)
      if (!data.sessions || !data.sessions[sessionKey] || data.sessions[sessionKey].token !== token) {
        return res.json({ valid: false, reason: 'device_conflict' });
      }
      
      // Update last active time
      data.sessions[sessionKey].lastActive = Date.now();
      await writeData(data);
      
      // 2. Continuous check: ensure email is STILL in the Google Sheet
      const isAdmin = normalizedEmail === ADMIN_EMAIL.toLowerCase().trim() || normalizedEmail === 'nguyenkhavy5002213@gmail.com';
      const subject = data.subjects[subjectId];
      
      if (!isAdmin && subject && subject.sheetUrl) {
        const allowedEmails = await getAllowedEmails(subjectId, subject.sheetUrl);
        if (!allowedEmails.includes(normalizedEmail)) {
          // Email was removed from the sheet! Revoke session.
          delete data.sessions[sessionKey];
          await writeData(data);
          return res.json({ valid: false, reason: 'removed_from_sheet' });
        }
      }

      res.json({ valid: true, subjectName: subject ? subject.name : undefined });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
     try {
       const { email, subjectId } = req.body;
       const data = await readData();
       const sessionKey = `${email}_${subjectId}`;
       if (email && subjectId && data.sessions && data.sessions[sessionKey]) {
         delete data.sessions[sessionKey];
         await writeData(data);
       }
       res.json({ success: true });
     } catch (e) {
       next(e);
     }
  });

  app.get('/api/admin/active-users', async (req, res, next) => {
    try {
      // Basic check for admin email in headers (for simplicity, real apps should use proper auth middleware)
      const adminEmail = req.headers['x-admin-email'];
      if (adminEmail !== ADMIN_EMAIL && adminEmail !== 'nguyenkhavy5002213@gmail.com') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const data = await readData();
      const sessions = data.sessions || {};
      const activeUsers = Object.entries(sessions).map(([email, session]: [string, any]) => ({
        email,
        lastActive: session.lastActive
      })).sort((a, b) => b.lastActive - a.lastActive);

      res.json({ activeUsers });
    } catch (e) {
      next(e);
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Server Error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
