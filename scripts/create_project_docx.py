import os
import zipfile
import shutil

def create_docx(filename: str):
    """
    Generate a valid Microsoft Word (.docx) document using standard OpenXML.
    Formatted in Hebrew (RTL) with clean styles, title, tables, and instructions.
    """
    content_types_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>'''

    rels_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

    doc_rels_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

    styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
        <w:sz w:val="24"/>
        <w:rtl w:val="1"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>'''

    document_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Title -->
    <w:p>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:jc w:val="center"/>
        <w:spacing w:after="240"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b w:val="1"/>
          <w:sz w:val="44"/>
          <w:color w:val="4338CA"/>
        </w:rPr>
        <w:t>מסמך פרטי הגשה - פרויקט FocusFlow</w:t>
      </w:r>
    </w:p>

    <!-- Subtitle -->
    <w:p>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:jc w:val="center"/>
        <w:spacing w:after="400"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:sz w:val="26"/>
          <w:color w:val="6B7280"/>
        </w:rPr>
        <w:t>מערכת Full-Stack למעקב וניטור קשב ולמידה (Assignment 3)</w:t>
      </w:r>
    </w:p>

    <!-- Section: Student Information -->
    <w:p>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:spacing w:before="240" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b w:val="1"/>
          <w:sz w:val="30"/>
          <w:color w:val="1F2937"/>
        </w:rPr>
        <w:t>1. פרטי המגיש/ה (Student Details)</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>שם הסטודנט/ית: </w:t></w:r>
      <w:r><w:t>[יש למלא שם מלא]</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>תעודת זהות: </w:t></w:r>
      <w:r><w:t>[יש למלא ת.ז.]</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>דוא&quot;ל: </w:t></w:r>
      <w:r><w:t>[יש למלא כתובת אימייל]</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>קישור ל-GitHub Repository: </w:t></w:r>
      <w:r><w:t>[יש למלא קישור למאגר הגיטהאב האישי]</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>שם משתמש ב-Docker Hub (אם נדרש): </w:t></w:r>
      <w:r><w:t>[יש למלא שם משתמש ב-Docker Hub]</w:t></w:r>
    </w:p>

    <!-- Section: Project Overview -->
    <w:p>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:spacing w:before="300" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b w:val="1"/>
          <w:sz w:val="30"/>
          <w:color w:val="1F2937"/>
        </w:rPr>
        <w:t>2. תיאור הפרויקט והארכיטקטורה</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:t>FocusFlow הינה מערכת Full-Stack מתקדמת שנועדה לסייע לתלמידים וסטודנטים לנטר ולשפר את רמת הקשב והריכוז שלהם במהלך למידה עצמאית. המערכת כוללת אימות משתמשים מלא ומאובטח (JWT + Bcrypt), ניהול ספריית תכנים (טקסטים וסרטוני YouTube מוטמעים), זיהוי 478 נקודות ציון פנים באמצעות מצלמת הרשת (MediaPipe), ארכיטקטורת Pipeline של 100 פריימים ב-10 FPS לחיזוי קשב, והיסטוריית סשנים מפורטת עם גרפי מעקב.</w:t></w:r>
    </w:p>

    <!-- Section: Services & Ports -->
    <w:p>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:spacing w:before="300" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b w:val="1"/>
          <w:sz w:val="30"/>
          <w:color w:val="1F2937"/>
        </w:rPr>
        <w:t>3. שירותי Docker Compose ופורטים</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>• שירות Frontend (React + Vite): </w:t></w:r>
      <w:r><w:t>פורט 3000 (http://localhost:3000)</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>• שירות Backend (FastAPI + Python): </w:t></w:r>
      <w:r><w:t>פורט 8000 (http://localhost:8000), בדיקת בריאות ב-http://localhost:8000/health ותיעוד Swagger ב-http://localhost:8000/docs</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>• שירות מסד נתונים MongoDB: </w:t></w:r>
      <w:r><w:t>פורט 27017 עם Docker Volume מתמשך (mongo_data)</w:t></w:r>
    </w:p>

    <!-- Section: Instructions -->
    <w:p>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:spacing w:before="300" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b w:val="1"/>
          <w:sz w:val="30"/>
          <w:color w:val="1F2937"/>
        </w:rPr>
        <w:t>4. הוראות הרצה (Setup Instructions)</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:t>1. יש לוודא שקובץ .env נמצא באותה תיקייה לצד docker-compose.yml.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:t>2. הפעלת כל השירותים באמצעות הפקודה:</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:b w:val="1"/></w:rPr><w:t>docker compose up --build -d</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:t>3. כניסה לדפדפן בכתובת http://localhost:3000 והרשמה כמשתמש חדש.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:t>4. כיבוי השירותים בתום השימוש: docker compose down</w:t></w:r>
    </w:p>

    <!-- Section: ONNX Model Notes -->
    <w:p>
      <w:pPr>
        <w:bidi w:val="1"/>
        <w:spacing w:before="300" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b w:val="1"/>
          <w:sz w:val="30"/>
          <w:color w:val="1F2937"/>
        </w:rPr>
        <w:t>5. מודל ONNX ומצב בדיקה מדומה (Simulation Mode)</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:bidi w:val="1"/></w:pPr>
      <w:r><w:t>צינור ההסקה תוכנן לקבלת טנזור 100 פריימים [1, 100, 478, 3]. בהיעדר קובץ מודל ONNX מקורי, המערכת מפעילה באופן אוטומטי שכבת מתאם (Model Adapter) במצב סימולציה המסומן במפורש בממשק ובמסד הנתונים כ-prediction_source: simulation. מצב זה מונע הצגת תוצאות מדומות כאילו היו מודל אמיתי, ומבטיח כיול אמין של כל זרימת הנתונים.</w:t></w:r>
    </w:p>

    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>'''

    # Package as standard .docx zip
    with zipfile.ZipFile(filename, 'w', zipfile.ZIP_DEFLATED) as docx:
        docx.writestr('[Content_Types].xml', content_types_xml)
        docx.writestr('_rels/.rels', rels_xml)
        docx.writestr('word/document.xml', document_xml)
        docx.writestr('word/styles.xml', styles_xml)
        docx.writestr('word/_rels/document.xml.rels', doc_rels_xml)

    print(f"Generated {filename} successfully.")

if __name__ == "__main__":
    create_docx("PROJECT_INFO.docx")
