# FocusFlow — מטלה 4: העלאה לענן (Google Cloud)

## הארכיטקטורה

```text
Browser → https://YOUR-DOMAIN
            │
   Google Load Balancer (HTTPS, 443, תעודה מנוהלת)   (+ הפניה מ-80 ל-443)
            │
            ├── /api/*  ו- /health  →  Cloud Run: focusflow-server (8000)
            └── כל השאר              →  Cloud Run: focusflow-client (3000)
                                              │
                         focusflow-server  →  MongoDB Atlas (M0)
```

## הבחירות שלנו והנימוקים (להגנה)

| נושא | הבחירה | למה |
|---|---|---|
| איפה רצים הקונטיינרים | **Cloud Run**, שירות נפרד ללקוח ולשרת | Google מנהלת את המכונות, העדכונים והאבטחה. כל שירות גדל בנפרד לפי העומס, ותקלה באחד לא מפילה את השני. אין צורך ב-Instance group, ב-Health check ובחוק Firewall כמו ב-VM. |
| כמה מופעים | **מינימום 2, מקסימום 4** לכל שירות | 2 מופעים קבועים מאפשרים ל-Load Balancer לאזן עומס באמת, ואם מופע אחד נופל השני ממשיך. אין "התנעה קרה" בזמן הבדיקה. המקסימום 4 שומר על הקרדיט. |
| מסד נתונים | **MongoDB Atlas (M0, חינמי)** | השרת כבר כתוב עם MongoDB (Motor), כך שלא היה צריך לשנות קוד. Atlas מנוהל וכולל גיבויים, ו-M0 חינמי, בניגוד ל-Cloud SQL שעולה כסף כל שעה. ב-Cloud Run אסור להריץ מסד, כי הדיסק שם זמני. |
| מצב בשרת | **אין מצב בזיכרון** | כל המשתמשים, התכנים, הסשנים והדגימות נשמרים ב-MongoDB, והאימות הוא JWT, כלומר stateless. לכן שני המופעים רואים בדיוק את אותם נתונים. |
| ניתוב | Path rules ב-URL map | כל נתיבי השרת כבר מתחילים ב-`/api` (וגם `/health`), ולכן לא היה צריך לשנות אותם. הלקוח פונה ל-`/api` יחסית, באותו דומיין, כך שאין בעיות CORS ואין mixed content. |
| HTTPS | תעודה מנוהלת של Google ב-Load Balancer | המצלמה (`getUserMedia`) עובדת רק בהקשר מאובטח. התעודה חינמית ומתחדשת לבד. |
| דומיין | No-IP (חינמי), רשומת A אחת לכתובת ה-IP הסטטית של ה-LB | יש hostname אחד, ולכן לקוח ושרת יושבים תחת אותו דומיין. **צריך לאשר אותו ב-No-IP כל 30 יום (מגיע במייל).** |
| סודות | **Secret Manager**: `focusflow-mongodb-url` ו-`focusflow-jwt-secret` | הסודות לא נמצאים בקוד, בתמונה ב-Docker Hub או בקובץ ב-Git. Cloud Run מקבל אותם כמשתני סביבה דרך "Reference a secret". מפתח ה-JWT נוצר אקראית ישירות לתוך Secret Manager. |
| גישה ישירה ל-Cloud Run | `ingress = internal-and-cloud-load-balancing` | אפשר להגיע לשירותים רק דרך ה-Load Balancer, לא דרך כתובת `run.app` ישירה. |

## מה שונה בקוד לעומת מטלה 3

- **`nginx.conf`** (קונטיינר הלקוח): אותה תמונה עובדת גם מקומית וגם בענן. כתובת השרת (`backend:8000`) נשמרת במשתנה ומתורגמת רק בזמן בקשה, ולכן nginx עולה גם ב-Cloud Run, שבו השם `backend` לא קיים. בענן בקשות `/api` בכלל לא מגיעות ללקוח, כי ה-Load Balancer שולח אותן ישר לשרת. מקומית (מטלה 3) ה-proxy ממשיך לעבוד כרגיל.
- **`backend/Dockerfile`**: השרת מאזין ל-`$PORT` (ברירת מחדל 8000) ומכבד את כותרות ה-proxy (HTTPS) של ה-Load Balancer.
- **`backend/app/config.py`**: כש-`ENVIRONMENT=production`, השרת מסרב לעלות אם `JWT_SECRET` או `MONGODB_URL` לא הגיעו ממשתני הסביבה. כך אין סיכוי שירוץ בענן עם מפתח ברירת המחדל.
- **Cookie**: מקבל `secure=True` ב-production (נשלח רק ב-HTTPS).
- **לוגים ו-/health**: כתובת המסד לא מודפסת יותר (הסיסמה מוסתרת), כדי שהסוד לא ידלוף ל-Cloud Logging.
- **`docker-compose.yml`**: אין יותר מפתח JWT קבוע בקובץ. הוא נקרא מ-`.env`.

## שלבי ההעלאה

### 0. הכנות חד-פעמיות
1. **Google Cloud**: פרויקט ב-Free Trial. **לא לשדרג (Upgrade)**. להגדיר Budget עם התראות (Billing → Budgets & alerts).
2. **MongoDB Atlas**: ליצור Cluster מסוג M0, ליצור משתמש למסד ולהעתיק את ה-connection string (`mongodb+srv://...`).
   ב-Network Access צריך להוסיף `0.0.0.0/0`, כי ל-Cloud Run אין כתובת IP יציאה קבועה. האבטחה נשענת על משתמש וסיסמה חזקים.
3. **No-IP**: ליצור hostname (למשל `focusflow-malka.ddns.net`).

### 1. בניית התמונות והעלאתן ל-Docker Hub (במחשב שלך)
Docker Desktop צריך לרוץ. מתיקיית הפרויקט:
```bash
docker login
bash deploy/build-and-push.sh
```

### 2. פריסה ל-Google Cloud (ב-Cloud Shell)
1. לפתוח את [Cloud Shell](https://shell.cloud.google.com) ולהעלות אליו את `deploy/deploy-gcp.sh` (תפריט ⋮ ← Upload).
2. לערוך בראש הקובץ את `PROJECT_ID` ואת `DOMAIN`.
3. להריץ:
   ```bash
   bash deploy-gcp.sh
   ```
   הסקריפט יבקש להדביק את ה-connection string של Atlas (הקלט מוסתר) ויוצר את כל השאר: סודות, שני שירותי Cloud Run, NEG-ים, Backend services, URL map, תעודה, HTTPS proxy וכתובת IP סטטית.

### 3. דומיין ותעודה
1. בסוף הריצה הסקריפט מדפיס את כתובת ה-IP של ה-Load Balancer.
2. ב-No-IP: רשומת **A** של ה-hostname ← **רק** הכתובת הזו.
3. לחכות שהתעודה תגיע ל-`ACTIVE` (עד כ-60 דקות; `PROVISIONING` בהתחלה זה תקין):
   ```bash
   gcloud compute ssl-certificates describe focusflow-cert --global --format='value(managed.status)'
   ```

### 4. בדיקה (כמו הבודק)
- [ ] `https://DOMAIN` נפתח בלי אזהרת אבטחה
- [ ] `https://DOMAIN/health` מחזיר 200
- [ ] הרשמה, התחברות, הוספת תוכן וסשן עם מצלמה
- [ ] אחרי רענון, התנתקות והתחברות מחדש, התוכן וההיסטוריה עדיין שם

### עדכון גרסה בהמשך
אחרי שינוי קוד: להריץ שוב `build-and-push.sh`, ואז שוב `deploy-gcp.sh`. הסקריפט מדלג על מה שכבר קיים ומפרוס מחדש את Cloud Run.

## תקלות נפוצות

| מה רואים | סיבה סבירה |
|---|---|
| התעודה תקועה ב-`PROVISIONING` / `FAILED_NOT_VISIBLE` | רשומת ה-A לא מצביעה על ה-IP של ה-LB, או שה-DNS עוד לא התעדכן |
| המצלמה לא נדלקת | האתר נפתח ב-`http://` |
| האתר עולה אבל ההתחברות נכשלת | `/health` מראה `database: disconnected`, כלומר צריך לבדוק את Network Access ב-Atlas ואת הסוד `focusflow-mongodb-url` |
| הפריסה של השרת נכשלת עם שגיאת סוד | חסר תפקיד `Secret Manager Secret Accessor` ל-Service Account |

## הגשה
קובץ JSON בלבד: [`focusflow-malka.json`](focusflow-malka.json). צריך לעדכן בו את הדומיין ואת שמות חברי הצוות.
