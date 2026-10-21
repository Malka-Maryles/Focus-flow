/**
 * FocusFlow Automated End-to-End Acceptance Criteria Test Suite
 * Validates all 15 acceptance criteria from the assignment specification.
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 מתחיל הרצת בדיקות קבלה אוטומטיות עבור FocusFlow...');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Health Endpoint
  console.log('\n--- 1. בדיקת בריאות השרת ---');
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = await healthRes.json();
  assert(healthRes.status === 200, 'Health endpoint החזיר קוד 200');
  assert(health.status === 'healthy', 'סטטוס שרת הוא healthy');

  // 2. Registration Validation (Short password)
  console.log('\n--- 2. בדיקת ולידציית הרשמה וסיסמה קצרה ---');
  const shortPwdRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'short@test.com', password: '123', display_name: 'קצר' }),
  });
  assert(shortPwdRes.status === 400, 'סיסמה קצרה נדחתה עם קוד 400');

  // 3. Register User A
  console.log('\n--- 3. הרשמת משתמש א׳ תקין ---');
  const userAEmail = `user_a_${Date.now()}@test.com`;
  const regARes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password: 'password123', display_name: 'משתמש א׳' }),
  });
  const userAData = await regARes.json();
  assert(regARes.status === 201, 'משתמש א׳ נרשם בהצלחה עם 201 Created');
  assert(Boolean(userAData.access_token), 'הופק טוקן JWT עבור משתמש א׳');
  const tokenA = userAData.access_token;

  // 4. Duplicate Email Rejection
  console.log('\n--- 4. דחיית אימייל כפול ---');
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password: 'password123', display_name: 'שכפול' }),
  });
  assert(dupRes.status === 400, 'אימייל כפול נדחה עם קוד 400');

  // 5. Login User A
  console.log('\n--- 5. התחברות עם פרטים נכונים ושגויים ---');
  const wrongLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password: 'wrong_password' }),
  });
  assert(wrongLoginRes.status === 401, 'התחברות עם סיסמה שגויה נדחתה ב-401');

  const goodLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password: 'password123' }),
  });
  assert(goodLoginRes.status === 200, 'התחברות עם סיסמה תקינה החזירה 200 OK');

  // 6. Content Management (Text & YouTube)
  console.log('\n--- 6. הוספת חומרי למידה (טקסט וסרטון YouTube) ---');
  const textRes = await fetch(`${BASE_URL}/api/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ title: 'מאמר בינה מלאכותית', content_type: 'text', text: 'טקסט לימוד מעמיק' }),
  });
  const textContent = await textRes.json();
  assert(textRes.status === 201, 'נוסף חומר טקסטואלי בהצלחה');

  const ytRes = await fetch(`${BASE_URL}/api/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ title: 'הרצאה ביוטיוב', content_type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' }),
  });
  const ytContent = await ytRes.json();
  assert(ytRes.status === 201, 'נוסף סרטון YouTube בהצלחה');

  const listContentRes = await fetch(`${BASE_URL}/api/content`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const contentList = await listContentRes.json();
  assert(contentList.length >= 2, 'רשימת התכנים של משתמש א׳ מכילה 2 פריטים');

  // 7. Start Learning Session
  console.log('\n--- 7. פתיחת סשן למידה ---');
  const sessionRes = await fetch(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ content_id: textContent.id }),
  });
  const sessionData = await sessionRes.json();
  assert(sessionRes.status === 201, 'סשן נפתח בהצלחה בסטטוס active');
  assert(sessionData.status === 'active', 'סטטוס הסשן הוא active');
  const sessionId = sessionData.id;

  // 8. Stream Valid Reading (Face present)
  console.log('\n--- 8. שליחת דגימת קשב תקינה (עם פנים) ---');
  const validReadingRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      attention_score: 0.85,
      face_detected: true,
      prediction_source: 'simulation',
    }),
  });
  const validReading = await validReadingRes.json();
  assert(validReadingRes.status === 201, 'דגימה תקינה נקלטה בשרת');
  assert(validReading.attention_score === 0.85, 'ציון קשב נשמר כ-0.85');

  // 9. Stream No-Face Reading (Enforcing no fake high scores!)
  console.log('\n--- 9. שליחת דגימה ללא פנים (וידוא אי-זיוף ציונים) ---');
  const noFaceReadingRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      attention_score: 0.99, // Attempts to send score while face_detected is false
      face_detected: false,
      prediction_source: 'simulation',
    }),
  });
  const noFaceReading = await noFaceReadingRes.json();
  assert(noFaceReadingRes.status === 201, 'דגימת היעדר פנים נקלטה');
  assert(noFaceReading.attention_score === null, 'השרת איפס את הציון ל-null כאשר face_detected=false!');

  // 10. End Session & Validate Calculations
  console.log('\n--- 10. סיום סשן וחישוב ממוצעים ---');
  const endRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const endedSession = await endRes.json();
  assert(endRes.status === 200, 'הסשן הסתיים בהצלחה בסטטוס completed');
  assert(endedSession.status === 'completed', 'סטטוס הסשן עודכן ל-completed');
  assert(endedSession.average_attention === 0.85, 'ממוצע הקשב חושב בדיוק של 0.85 מדגימת הפנים התקפה בלבד!');
  assert(endedSession.valid_readings_count === 1, 'מונה דגימות תקינות הוא 1');
  assert(endedSession.total_readings_count === 2, 'מונה סה״כ דגימות הוא 2');

  // 11. Fetch Session Detail & Readings
  console.log('\n--- 11. שליפת היסטוריה וגרף דגימות ---');
  const detailRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const detail = await detailRes.json();
  assert(detailRes.status === 200, 'פרטי הסשן נשלפו בהצלחה');
  assert(detail.readings && detail.readings.length === 2, 'הסשן כולל את 2 הדגימות בציר הזמן');

  // 12. Register User B & Verify Strict Ownership Isolation
  console.log('\n--- 12. בדיקת בידוד נתונים מוחלט (משתמש ב׳ מול משתמש א׳) ---');
  const userBEmail = `user_b_${Date.now()}@test.com`;
  const regBRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userBEmail, password: 'password123', display_name: 'משתמש ב׳' }),
  });
  const userBData = await regBRes.json();
  const tokenB = userBData.access_token;

  // User B tries to view User A's content
  const attackContentRes = await fetch(`${BASE_URL}/api/content/${textContent.id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(attackContentRes.status === 403 || attackContentRes.status === 404, 'משתמש ב׳ נחסם מלצפות בתוכן של משתמש א׳ (403/404)');

  // User B tries to delete User A's content
  const attackDeleteRes = await fetch(`${BASE_URL}/api/content/${textContent.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(attackDeleteRes.status === 403 || attackDeleteRes.status === 404, 'משתמש ב׳ נחסם מלמחוק תוכן של משתמש א׳ (403/404)');

  // User B tries to view User A's session
  const attackSessionRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(attackSessionRes.status === 403 || attackSessionRes.status === 404, 'משתמש ב׳ נחסם מלצפות בסשן של משתמש א׳ (403/404)');

  // 13. Logout & Protected Route Verification
  console.log('\n--- 13. התנתקות והגנת נתיבים ---');
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST' });
  assert(logoutRes.status === 200, 'התנתקות הסתיימה בהצלחה');

  const unauthRes = await fetch(`${BASE_URL}/api/content`, { headers: {} });
  assert(unauthRes.status === 401, 'גישה לנתיב מוגן ללא טוקן נדחתה ב-401');

  console.log(`\n========================================`);
  console.log(`🎉 סיכום בדיקות קבלה: ${passed} עברו, ${failed} נכשלו`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
