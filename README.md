# תסקיר דירות

אפליקציית אינטרנט לדירוג דירות לשכירות בקבוצה — זוג, משפחה או שותפים לדירה. כל
קבוצה פותחת "תסקיר" משלה דרך קישור פרטי ייחודי (בלי הרשמה, בלי סיסמה — כל מי שיש
לו את הקישור יכול לגשת), מוסיפה דירות, מעלה תמונות, ממלאת מחיר/ארנונה/ועד
בית/איש קשר, ומגדירה מי המדרגים בקבוצה. כל מדרג/ת נותנ/ת ציון 1–10 בנפרד לכל
קטגוריה (מיקום, מצב הדירה, אור וכו'), וכל הנתונים מוצגים גם בדאשבורד עם גרפים
והשוואות: הדירה הכי זולה, הכי יקרה, הכי משתלמת (ערך תמורה למחיר), פילוח לפי
סטטוס ועוד. כל הנתונים נשמרים בקובץ SQLite מקומי בשרת — בלי מסד נתונים חיצוני,
בלי ענן צד שלישי.

## הרצה מקומית (לבדיקה)

```bash
npm install
npm start
```

האתר יעלה בכתובת http://localhost:3450

## העלאה לשרת ה-VPS שלך

### שלב 1 — התקנת Node.js בשרת (אם עוד אין)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs build-essential
```

(`build-essential` נדרש כי better-sqlite3 מקמפל קוד native בהתקנה — קורה פעם אחת ב-`npm install`)

### שלב 2 — העלאת הקבצים

מהמחשב שלך, מתוך תיקיית הפרויקט (בלי `node_modules`):

```bash
rsync -avz --exclude node_modules --exclude db/*.db ./ user@your-vps-ip:/opt/apartment-rater/
```

או פשוט `git clone` אם שמת את זה ב-repo פרטי.

### שלב 3 — התקנה והרצה בשרת

```bash
ssh user@your-vps-ip
cd /opt/apartment-rater
npm install --omit=dev
```

### שלב 4 — הרצה קבועה עם pm2 (מומלץ)

```bash
sudo npm install -g pm2
pm2 start server.js --name apartment-rater
pm2 save
pm2 startup   # מדפיס פקודה להרצה — הרץ אותה כדי שהשרת יעלה גם אחרי ריבוט
```

עדכון גרסה בעתיד:
```bash
cd /opt/apartment-rater
git pull   # או rsync מחדש
npm install --omit=dev
pm2 restart apartment-rater
```

### שלב 5 — חשיפה דרך דומיין עם Nginx (אופציונלי אך מומלץ)

אם יש לך דומיין/סאב-דומיין (לדוגמה `apartments.yourdomain.com`) שמצביע על ה-VPS:

```nginx
server {
    listen 80;
    server_name apartments.yourdomain.com;

    client_max_body_size 20m;   # כדי לאפשר העלאת תמונות

    location / {
        proxy_pass http://127.0.0.1:3450;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

שמור בקובץ `/etc/nginx/sites-available/apartment-rater`, קשר עם:
```bash
sudo ln -s /etc/nginx/sites-available/apartment-rater /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

ואז להוסיף HTTPS חינם עם Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d apartments.yourdomain.com
```

בלי דומיין — אפשר גם פשוט לגשת ל-`http://your-vps-ip:3450` ישירות (ודאו שפורט 3450 פתוח
ב-firewall: `sudo ufw allow 3450`).

## גיבוי

כל הנתונים (כולל תמונות) נמצאים בשתי תיקיות בלבד:
- `db/apartments.db` — כל הטקסט: דירות, ציונים, קטגוריות
- `public/uploads/` — כל התמונות שהועלו

מספיק לגבות את שתי אלה מדי פעם (לדוגמה `cron` עם `rsync` לגיבוי חיצוני).

## מבנה הפרויקט

```
server.js            שרת Express + כל ה-API (מרובה-תסקירים, board_id בכל טבלה)
public/landing.html  דף הבית — פתיחת תסקיר חדש
public/landing.js    לוגיקת דף הבית
public/index.html    עמוד התסקיר (/b/:boardId)
public/styles.css    עיצוב (משותף לשני העמודים)
public/landing.css   עיצוב ספציפי לדף הבית
public/app.js        לוגיקת הצד לקוח — רשימת דירות, מודאל פרטים, הגדרות
public/dashboard.js  חישובי הדאשבורד וגרפי ה-SVG
db/                  מסד הנתונים (SQLite, נוצר אוטומטית בהרצה ראשונה)
public/uploads/      תמונות שהועלו
```

## איך זה עובד

- כל תסקיר מזוהה ע"י קוד אקראי בכתובת (`/b/xxxxxxxxxxxx`) — זו גם "הסיסמה"
  היחידה: מי שיש לו את הקישור, יש לו גישה מלאה. שתפו אותו רק עם מי שאתם
  רוצים שישתתף.
- מי מדרג, שם התסקיר וקטגוריות הציונים ניתנים לעריכה מלאה דרך האתר (כפתור
  ההגדרות ⚙ בראש העמוד) — אין יותר שמות מדרגים קבועים בקוד.
- טאב "דאשבורד" מציג KPI-ים וגרפים שמחושבים אוטומטית מהנתונים: עלות
  חודשית (שכירות+ארנונה+ועד בית), ערך תמורה למחיר, השוואת ציונים בין
  המדרגים, ממוצע לפי קטגוריה, פילוח סטטוסים, וטבלת דירוג מלאה.
- מסד נתונים ישן (מלפני התכונה הזו, עם רשימת דירות אחת משותפת) הופך
  אוטומטית בהרצה הראשונה ל"תסקיר" משלו — הכתובת שלו תודפס לקונסול השרת.
