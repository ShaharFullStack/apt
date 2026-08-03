# תסקיר דירות — Renter CRM (M0)

כלי CRM לדיירים בשלב שאחרי החיפוש — עכשיו כ-**workspace משותף בזמן אמת**
(זוג/משפחה/שותפים), לא כלי אישי. ראה את המפרט המלא (מסכים, מודל נתונים,
מבחן עומס, אבני דרך) במסמך שפורסם בשיחה.

**מצב נוכחי: M0 — יסודות + Workspace.** יש: הרשמה/כניסה, יצירת workspace,
הזמנת שותפים בקישור, הצטרפות, ורשימת חברים חיה (realtime). **אין עדיין**:
דירות, צ'קליסט, דירוג, השוואה — אלה M1 ואילך.

## סטאק

- **Frontend**: React + TypeScript + Vite, React Router, PocketBase JS SDK.
- **Backend**: [PocketBase](https://pocketbase.io) — בינארי Go יחיד, SQLite
  מוטמע, auth+realtime(SSE)+אחסון קבצים מובנים. ה-schema מוגדר כ-migrations
  גרסתיות ב-`pb_migrations/`. לוגיקת ה-join-by-invite-code היחידה שדורשת קוד
  שרת נמצאת ב-`pb_hooks/join.pb.js`.

## חשוב: לא נבדק מול PocketBase אמיתי

הסביבה שבה זה נכתב חסומה להורדות גנריות מ-GitHub (מדיניות ארגונית) ולכן לא
היה אפשר להוריד את הבינארי של PocketBase ולהריץ אותו שם. מה שכן אומת:
`tsc -b` ו-`vite build` עוברים נקי, וקבצי ה-migration תקינים תחבירית.
**את זה — קוד ה-JSVM ב-`pb_hooks/join.pb.js` במיוחד — צריך להריץ פעם אחת
אצלכם ולוודא שעולה בלי שגיאה ביומן ה-`pocketbase serve`.** אם יש שגיאת API
שם, זה כמעט בטוח עניין של גרסת PocketBase (ה-API של ה-JSVM hooks עבר כמה
שינויי שמות) — עמוד ה-JSVM Overview הרשמי מראה את השמות המדויקים לגרסה שלכם.

## הרצה מקומית

```bash
# 1. הורידו את הבינארי המתאים למערכת שלכם מ-https://pocketbase.io/docs/ ושימו
#    בתיקיית renter-crm/ (או בכל מקום, ותנו נתיב מלא בפקודה הבאה)
./pocketbase serve
# עולה על http://127.0.0.1:8090, מריץ את pb_migrations/ ו-pb_hooks/ אוטומטית

# 2. בטרמינל נפרד
cp .env.example .env   # ברירת המחדל כבר מצביעה ל-127.0.0.1:8090
npm install
npm run dev
```

## בדיקת עשן (חובה, כי לא נבדק פה)

1. פתחו את `http://localhost:8090/_/` (Admin UI של PocketBase) וודאו שרואים
   5 collections: workspaces, workspace_members, properties, property_ratings,
   inspection_logs — סימן שה-migrations רצו בהצלחה.
2. בדפדפן א' (או חלון רגיל): `http://localhost:5173` → הרשמה → "פתיחת תסקיר
   חדש" → "העתקת קישור הזמנה".
3. בדפדפן ב' (חלון גלישה בסתר, כדי לא לשתף session) → הדביקו את קישור
   ההזמנה → הרשמה עם מייל אחר → אמורים לעבור אוטומטית ל-workspace.
4. חזרו לדפדפן א' — חבר/ת הקבוצה החדש/ה אמורים להופיע ברשימה **בלי רענון
   דף**. זו ההוכחה שה-realtime עובד מקצה לקצה.
5. אם שלב 3 נכשל עם שגיאת שרת — בדקו את יומן `pocketbase serve` לשגיאה
   ב-`join.pb.js` (ראה הערה למעלה).

## פריסה ל-VPS (לצד האפליקציה השנייה שכבר שם)

```bash
# על ה-VPS
mkdir -p /opt/renter-crm && cd /opt/renter-crm
# הורידו את בינארי הלינוקס המתאים מ-pocketbase.io/docs, שימו כאן בשם `pocketbase`
chmod +x pocketbase
# העתיקו לכאן גם pb_migrations/ ו-pb_hooks/ מה-repo
```

systemd service (`/etc/systemd/system/renter-crm-pb.service`):
```ini
[Unit]
Description=Renter CRM PocketBase
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/renter-crm
ExecStart=/opt/renter-crm/pocketbase serve --http=127.0.0.1:8091
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now renter-crm-pb
```

בניית ה-frontend (סטטי, מוגש ע"י nginx):
```bash
cd /path/to/repo/renter-crm
echo "VITE_POCKETBASE_URL=https://renter.yourdomain.com/pb" > .env
npm install && npm run build   # dist/
```

Nginx (location block נוסף, לצד זה של האפליקציה הקיימת):
```nginx
server {
    listen 80;
    server_name renter.yourdomain.com;

    location /pb/ {
        proxy_pass http://127.0.0.1:8091/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # SSE (realtime) — בלי buffering, אחרת העדכונים החיים נתקעים
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    location / {
        root /path/to/repo/renter-crm/dist;
        try_files $uri /index.html;
    }
}
```

## מה הלאה

M1–M8 (דירות, צ'קליסט, דירוג משוקלל + קונצנזוס קבוצתי, מטריצת השוואה,
זרימת "חתמתי!") — לפי המפרט. כל אבן דרך נבנית ונבדקת בנפרד.
