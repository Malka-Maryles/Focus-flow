import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'focusflow_jwt_secret_dev_32_characters_long_key_12345';
const JWT_EXPIRES_IN = '7d';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Database models in-memory storage (with structure matching MongoDB collections)
interface UserDoc {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
}

interface ContentDoc {
  id: string;
  user_id: string;
  title: string;
  content_type: 'text' | 'youtube';
  text?: string;
  url?: string;
  created_at: string;
}

interface ReadingDoc {
  id: string;
  session_id: string;
  timestamp: string;
  attention_score: number | null;
  face_detected: boolean;
  prediction_source: string;
}

interface SessionDoc {
  id: string;
  user_id: string;
  content_id: string;
  content_title?: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: 'active' | 'completed';
  average_attention: number | null;
  valid_readings_count: number;
  total_readings_count: number;
}

const users: Map<string, UserDoc> = new Map();
const content: Map<string, ContentDoc> = new Map();
const sessions: Map<string, SessionDoc> = new Map();
const readings: Map<string, ReadingDoc> = new Map();

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// Authentication middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    display_name: string;
  };
}

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    res.status(401).json({ detail: 'נדרשת התחברות למערכת. לא סופק מפתח גישה תקף.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    const user = users.get(payload.sub);
    if (!user) {
      res.status(401).json({ detail: 'המשתמש אינו קיים במערכת.' });
      return;
    }
    req.user = {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
    };
    next();
  } catch {
    res.status(401).json({ detail: 'טוקן האימות פג תוקף או אינו תקף. אנא התחבר מחדש.' });
    return;
  }
}

// --- Health Check ---
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    app: 'FocusFlow',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: 'connected',
      type: 'in-memory / mongodb-ready',
      users_count: users.size,
      sessions_count: sessions.size,
    },
    simulation_mode: true,
    message_he: 'שרת FocusFlow פועל בהצלחה',
  });
});

// --- Auth Endpoints ---
app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { email, password, display_name } = req.body;

  if (!email || !password || !display_name) {
    res.status(400).json({ detail: 'כל השדות הינם שדות חובה.' });
    return;
  }

  const emailClean = String(email).toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailClean)) {
    res.status(400).json({ detail: 'כתובת אימייל אינה תקינה.' });
    return;
  }

  if (String(password).length < 8) {
    res.status(400).json({ detail: 'הסיסמה חייבת להכיל לפחות 8 תווים.' });
    return;
  }

  if (String(display_name).trim().length < 2) {
    res.status(400).json({ detail: 'שם התצוגה חייב להכיל לפחות 2 תווים.' });
    return;
  }

  // Check duplicate email
  for (const u of users.values()) {
    if (u.email === emailClean) {
      res.status(400).json({ detail: 'כתובת האימייל כבר קיימת במערכת. אנא התחבר.' });
      return;
    }
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  const id = generateId();
  const created_at = new Date().toISOString();

  const newUser: UserDoc = {
    id,
    email: emailClean,
    password_hash,
    display_name: String(display_name).trim(),
    created_at,
  };

  users.set(id, newUser);

  const token = jwt.sign({ sub: id, email: emailClean }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  res.cookie('access_token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  });

  res.status(201).json({
    access_token: token,
    token_type: 'bearer',
    user: {
      id: newUser.id,
      email: newUser.email,
      display_name: newUser.display_name,
      created_at: newUser.created_at,
    },
  });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ detail: 'יש להזין אימייל וסיסמה.' });
    return;
  }

  const emailClean = String(email).toLowerCase().trim();
  let foundUser: UserDoc | undefined;

  for (const u of users.values()) {
    if (u.email === emailClean) {
      foundUser = u;
      break;
    }
  }

  if (!foundUser) {
    res.status(401).json({ detail: 'כתובת אימייל או סיסמה שגויים. אנא נסה שוב.' });
    return;
  }

  const validPassword = await bcrypt.compare(password, foundUser.password_hash);
  if (!validPassword) {
    res.status(401).json({ detail: 'כתובת אימייל או סיסמה שגויים. אנא נסה שוב.' });
    return;
  }

  const token = jwt.sign({ sub: foundUser.id, email: foundUser.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  res.cookie('access_token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  });

  res.status(200).json({
    access_token: token,
    token_type: 'bearer',
    user: {
      id: foundUser.id,
      email: foundUser.email,
      display_name: foundUser.display_name,
      created_at: foundUser.created_at,
    },
  });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('access_token');
  res.status(200).json({ message: 'התנתקת בהצלחה מהמערכת', status: 'success' });
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({
    id: req.user!.id,
    email: req.user!.email,
    display_name: req.user!.display_name,
    created_at: new Date().toISOString(),
  });
});

// --- Content Endpoints ---
app.post('/api/content', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { title, content_type, text, url } = req.body;

  if (!title || String(title).trim().length < 2) {
    res.status(400).json({ detail: 'כותרת התוכן חייבת להכיל לפחות 2 תווים.' });
    return;
  }

  if (content_type !== 'text' && content_type !== 'youtube') {
    res.status(400).json({ detail: 'סוג תוכן לא חוקי. מותר טקסט או יוטיוב בלבד.' });
    return;
  }

  if (content_type === 'text' && (!text || !String(text).trim())) {
    res.status(400).json({ detail: 'תוכן טקסטואלי אינו יכול להיות ריק כאשר סוג התוכן הוא טקסט.' });
    return;
  }

  if (content_type === 'youtube') {
    if (!url || !String(url).trim()) {
      res.status(400).json({ detail: 'קישור וידאו נדרש כאשר סוג התוכן הוא יוטיוב.' });
      return;
    }
    const cleanUrl = String(url).trim();
    if (!cleanUrl.includes('youtube.com') && !cleanUrl.includes('youtu.be')) {
      res.status(400).json({ detail: 'יש להזין כתובת YouTube תקינה (youtube.com או youtu.be).' });
      return;
    }
  }

  const newDoc: ContentDoc = {
    id: generateId(),
    user_id: req.user!.id,
    title: String(title).trim(),
    content_type,
    text: text ? String(text).trim() : undefined,
    url: url ? String(url).trim() : undefined,
    created_at: new Date().toISOString(),
  };

  content.set(newDoc.id, newDoc);
  res.status(201).json(newDoc);
});

app.get('/api/content', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const userContent: ContentDoc[] = [];
  for (const item of content.values()) {
    if (item.user_id === req.user!.id) {
      userContent.push(item);
    }
  }
  userContent.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.status(200).json(userContent);
});

app.get('/api/content/:content_id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const item = content.get(req.params.content_id);
  if (!item) {
    res.status(404).json({ detail: 'חומר הלמידה המבוקש לא נמצא.' });
    return;
  }
  if (item.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לגשת לחומר למידה זה.' });
    return;
  }
  res.status(200).json(item);
});

app.delete('/api/content/:content_id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const item = content.get(req.params.content_id);
  if (!item) {
    res.status(404).json({ detail: 'חומר הלמידה המבוקש לא נמצא.' });
    return;
  }
  if (item.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה למחוק חומר למידה זה.' });
    return;
  }
  content.delete(req.params.content_id);
  res.status(200).json({ message: 'חומר הלמידה נמחק בהצלחה', id: req.params.content_id });
});

// --- Session Endpoints ---
app.post('/api/sessions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { content_id } = req.body;
  if (!content_id) {
    res.status(400).json({ detail: 'נדרש מזהה חומר למידה.' });
    return;
  }

  const contentDoc = content.get(content_id);
  if (!contentDoc) {
    res.status(404).json({ detail: 'חומר הלמידה המבוקש עבור הסשן לא נמצא.' });
    return;
  }

  if (contentDoc.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לפתוח סשן עבור תוכן זה.' });
    return;
  }

  const now = new Date().toISOString();
  const newSession: SessionDoc = {
    id: generateId(),
    user_id: req.user!.id,
    content_id: contentDoc.id,
    content_title: contentDoc.title,
    started_at: now,
    ended_at: null,
    duration_seconds: 0,
    status: 'active',
    average_attention: null,
    valid_readings_count: 0,
    total_readings_count: 0,
  };

  sessions.set(newSession.id, newSession);
  res.status(201).json(newSession);
});

app.post('/api/sessions/:session_id/readings', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const session = sessions.get(req.params.session_id);
  if (!session) {
    res.status(404).json({ detail: 'סשן הלמידה לא נמצא.' });
    return;
  }

  if (session.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה להוסיף נתונים לסשן זה.' });
    return;
  }

  if (session.status === 'completed') {
    res.status(400).json({ detail: 'הסשן כבר הסתיים. לא ניתן להוסיף דגימות נוספות.' });
    return;
  }

  const { timestamp, attention_score, face_detected, prediction_source } = req.body;

  const validScore = face_detected && typeof attention_score === 'number'
    ? Math.max(0, Math.min(1, attention_score))
    : null;

  const reading: ReadingDoc = {
    id: generateId(),
    session_id: session.id,
    timestamp: timestamp || new Date().toISOString(),
    attention_score: validScore,
    face_detected: Boolean(face_detected),
    prediction_source: prediction_source || 'simulation',
  };

  readings.set(reading.id, reading);

  session.total_readings_count += 1;
  if (validScore !== null) {
    session.valid_readings_count += 1;
  }

  res.status(201).json(reading);
});

app.post('/api/sessions/:session_id/end', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const session = sessions.get(req.params.session_id);
  if (!session) {
    res.status(404).json({ detail: 'סשן הלמידה לא נמצא.' });
    return;
  }

  if (session.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לסיים סשן זה.' });
    return;
  }

  const now = new Date();
  const startedAt = new Date(session.started_at);
  const durationSeconds = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 1000));

  const sessionReadings: ReadingDoc[] = [];
  for (const r of readings.values()) {
    if (r.session_id === session.id) {
      sessionReadings.push(r);
    }
  }

  const validScores = sessionReadings
    .filter((r) => r.face_detected && r.attention_score !== null)
    .map((r) => r.attention_score as number);

  const avgAttention = validScores.length > 0
    ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 1000) / 1000
    : null;

  session.ended_at = now.toISOString();
  session.duration_seconds = durationSeconds;
  session.status = 'completed';
  session.average_attention = avgAttention;
  session.valid_readings_count = validScores.length;
  session.total_readings_count = sessionReadings.length;

  res.status(200).json(session);
});

app.get('/api/sessions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const userSessions: SessionDoc[] = [];
  for (const s of sessions.values()) {
    if (s.user_id === req.user!.id) {
      userSessions.push(s);
    }
  }
  userSessions.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  res.status(200).json(userSessions);
});

app.get('/api/sessions/:session_id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const session = sessions.get(req.params.session_id);
  if (!session) {
    res.status(404).json({ detail: 'סשן הלמידה לא נמצא.' });
    return;
  }

  if (session.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לצפות בסשן זה.' });
    return;
  }

  const sessionReadings: ReadingDoc[] = [];
  for (const r of readings.values()) {
    if (r.session_id === session.id) {
      sessionReadings.push(r);
    }
  }
  sessionReadings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  res.status(200).json({
    ...session,
    readings: sessionReadings,
  });
});

// Vite middleware for development serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FocusFlow Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
