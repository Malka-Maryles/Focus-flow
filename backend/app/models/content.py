from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, model_validator

class ContentType(str, Enum):
    TEXT = "text"
    YOUTUBE = "youtube"

class ContentCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=150, description="כותרת חומר הלמידה")
    content_type: ContentType = Field(..., description="סוג התוכן: טקסט או סרטון יוטיוב")
    text: Optional[str] = Field(None, description="תוכן טקסטואלי לקריאה")
    url: Optional[str] = Field(None, description="כתובת URL של סרטון יוטיוב")

    @model_validator(mode="after")
    def validate_content_payload(self):
        if self.content_type == ContentType.TEXT:
            if not self.text or not self.text.strip():
                raise ValueError("תוכן טקסטואלי אינו יכול להיות ריק כאשר סוג התוכן הוא טקסט")
        elif self.content_type == ContentType.YOUTUBE:
            if not self.url or not self.url.strip():
                raise ValueError("קישור וידאו נדרש כאשר סוג התוכן הוא יוטיוב")
            cleaned_url = self.url.strip()
            if "youtube.com" not in cleaned_url and "youtu.be" not in cleaned_url:
                raise ValueError("יש להזין כתובת YouTube תקינה (youtube.com או youtu.be)")
        return self

class ContentResponse(BaseModel):
    id: str
    user_id: str
    title: str
    content_type: ContentType
    text: Optional[str] = None
    url: Optional[str] = None
    created_at: datetime
