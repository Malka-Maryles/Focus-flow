from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class SessionStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"

class ReadingCreateRequest(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="זמן הדגימה")
    attention_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="ציון קשב בין 0 ל-1 כאשר יש פנים")
    face_detected: bool = Field(..., description="האם זוהו פנים מול המצלמה")
    prediction_source: str = Field(default="simulation", description="מקור החיזוי: 'simulation' או 'onnx_model'")

class ReadingResponse(BaseModel):
    id: str
    session_id: str
    timestamp: datetime
    attention_score: Optional[float] = None
    face_detected: bool
    prediction_source: str

class SessionCreateRequest(BaseModel):
    content_id: str = Field(..., description="מזהה חומר הלמידה שעבורו נפתח הסשן")

class SessionResponse(BaseModel):
    id: str
    user_id: str
    content_id: str
    content_title: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int = 0
    status: SessionStatus
    average_attention: Optional[float] = None
    valid_readings_count: int = 0
    total_readings_count: int = 0

class SessionDetailResponse(SessionResponse):
    readings: List[ReadingResponse] = []
