# FocusFlow — מערכת מעקב קשב ולמידה

FocusFlow היא מערכת Full-Stack חכמה למעקב וניטור רמת קשב וריכוז של סטודנטים ותלמידים במהלך למידה עצמאית. המערכת מזהה נקודות ציון פנים באמצעות מצלמת הרשת, מעבדת רצפי תנועה ומפיקה מדדי קשב בזמן אמת, תוך שמירה מלאה על פרטיות המשתמש.

---

## 🛠️ טכנולוגיות הפרויקט

* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, MediaPipe Face Landmarker (478 נקודות ציון פנים).
* **Backend:** Python 3.10+, FastAPI, Pydantic, Motor (Async MongoDB), PyJWT, Passlib (Bcrypt).
* **Database:** MongoDB 6.0 עם כרך נתונים עמיד (Docker Volume).
* **Inference Pipeline:** ארכיטקטורת חלון נע (Sliding Window) של 100 פריימים ב-10 FPS עבור מודל ONNX.
* **DevOps:** Docker, Docker Compose, Healthchecks ובידוד רשתות.

---

## 🚀 הרצה מקומית באמצעות Docker Compose

1. העתק את קובץ הגדרות הסביבה:
   ```bash
   cp .env.example .env
   ```
2. הפעל את כל השירותים באמצעות פקודה אחת:
   ```bash
   docker compose up --build -d
   ```
3. גש למערכת בדפדפן:
   * **ממשק המשתמש (Frontend):** [http://localhost:3000](http://localhost:3000)
   * **בדיקת בריאות השרת (Health):** [http://localhost:8000/health](http://localhost:8000/health)
   * **תיעוד ה-API האינטראקטיבי (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📂 מבנה התיקיות

```text
├── backend/            # קוד השרת (FastAPI, מסד נתונים, אימות, נתיבים ובדיקות)
├── src/                # קוד צד הלקוח (React, TypeScript, רכיבים ודפים)
├── docker-compose.yml  # תצורת שירותי Docker
├── Dockerfile          # קובץ בניית מכולת ה-Frontend
├── .env.example        # תבנית משתני סביבה לדוגמה
└── README.md           # מדריך הפעלה
```
