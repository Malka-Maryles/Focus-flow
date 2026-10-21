from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from app.database.mongo import get_database
from app.models.session import (
    SessionCreateRequest,
    SessionResponse,
    SessionDetailResponse,
    SessionStatus,
    ReadingCreateRequest,
    ReadingResponse
)
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/sessions", tags=["Learning Sessions"])

@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreateRequest, current_user: dict = Depends(get_current_user)):
    """Start a new learning session for a specific content item."""
    db = get_database()
    
    # Verify content exists and is owned by current user
    try:
        c_oid = ObjectId(payload.content_id)
        content_doc = await db.content.find_one({"_id": c_oid})
    except Exception:
        content_doc = await db.content.find_one({"_id": payload.content_id})
        
    if not content_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="חומר הלמידה המבוקש עבור הסשן לא נמצא.")
        
    if content_doc.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין לך הרשאה לפתוח סשן עבור תוכן זה.")
        
    now = datetime.utcnow()
    session_doc = {
        "user_id": current_user["id"],
        "content_id": str(content_doc["_id"]),
        "content_title": content_doc.get("title", "תוכן למידה"),
        "started_at": now,
        "ended_at": None,
        "duration_seconds": 0,
        "status": SessionStatus.ACTIVE.value,
        "average_attention": None,
        "valid_readings_count": 0,
        "total_readings_count": 0
    }
    
    result = await db.sessions.insert_one(session_doc)
    session_id_str = str(result.inserted_id)
    
    return SessionResponse(
        id=session_id_str,
        user_id=current_user["id"],
        content_id=str(content_doc["_id"]),
        content_title=content_doc.get("title"),
        started_at=now,
        ended_at=None,
        duration_seconds=0,
        status=SessionStatus.ACTIVE,
        average_attention=None,
        valid_readings_count=0,
        total_readings_count=0
    )

@router.post("/{session_id}/readings", response_model=ReadingResponse, status_code=status.HTTP_201_CREATED)
async def add_session_reading(
    session_id: str,
    payload: ReadingCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Record an attention reading for an active session.
    Validates face detection: when face is not detected, attention_score must not be treated as high attention.
    """
    db = get_database()
    try:
        s_oid = ObjectId(session_id)
        session_doc = await db.sessions.find_one({"_id": s_oid})
    except Exception:
        session_doc = await db.sessions.find_one({"_id": session_id})
        
    if not session_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="סשן הלמידה לא נמצא.")
        
    if session_doc.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="סשן הלמידה לא נמצא.")
        
    if session_doc.get("status") == SessionStatus.COMPLETED.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="הסשן כבר הסתיים. לא ניתן להוסיף דגימות נוספות.")
        
    # Enforce data hygiene: if no face is detected, attention_score is set to None
    valid_score = payload.attention_score if payload.face_detected else None
    
    reading_doc = {
        "session_id": session_id,
        "timestamp": payload.timestamp or datetime.utcnow(),
        "attention_score": valid_score,
        "face_detected": payload.face_detected,
        "prediction_source": payload.prediction_source or "simulation"
    }
    
    result = await db.readings.insert_one(reading_doc)
    reading_id_str = str(result.inserted_id)
    
    # Update reading counts on session
    inc_update = {"total_readings_count": 1}
    if valid_score is not None:
        inc_update["valid_readings_count"] = 1
    await db.sessions.update_one({"_id": session_doc["_id"]}, {"$inc": inc_update})
    
    return ReadingResponse(
        id=reading_id_str,
        session_id=session_id,
        timestamp=reading_doc["timestamp"],
        attention_score=valid_score,
        face_detected=payload.face_detected,
        prediction_source=reading_doc["prediction_source"]
    )

@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """
    Cleanly terminate a learning session.
    Computes duration and calculates average attention strictly from valid readings.
    """
    db = get_database()
    try:
        s_oid = ObjectId(session_id)
        session_doc = await db.sessions.find_one({"_id": s_oid})
    except Exception:
        session_doc = await db.sessions.find_one({"_id": session_id})
        
    if not session_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="סשן הלמידה לא נמצא.")
        
    if session_doc.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין לך הרשאה לסיים סשן זה.")
        
    now = datetime.utcnow()
    started_at = session_doc.get("started_at", now)
    duration = max(1, int((now - started_at).total_seconds()))
    
    # Calculate average attention from all valid readings of this session
    cursor = db.readings.find({"session_id": session_id, "face_detected": True, "attention_score": {"$ne": None}})
    scores: List[float] = []
    async for r in cursor:
        if r.get("attention_score") is not None:
            scores.append(float(r["attention_score"]))
            
    total_readings = await db.readings.count_documents({"session_id": session_id})
    avg_attention = round(sum(scores) / len(scores), 3) if scores else None
    
    update_fields = {
        "ended_at": now,
        "duration_seconds": duration,
        "status": SessionStatus.COMPLETED.value,
        "average_attention": avg_attention,
        "valid_readings_count": len(scores),
        "total_readings_count": total_readings
    }
    
    await db.sessions.update_one({"_id": session_doc["_id"]}, {"$set": update_fields})
    
    return SessionResponse(
        id=str(session_doc["_id"]),
        user_id=session_doc["user_id"],
        content_id=session_doc["content_id"],
        content_title=session_doc.get("content_title"),
        started_at=started_at,
        ended_at=now,
        duration_seconds=duration,
        status=SessionStatus.COMPLETED,
        average_attention=avg_attention,
        valid_readings_count=len(scores),
        total_readings_count=total_readings
    )

@router.get("", response_model=List[SessionResponse])
async def list_user_sessions(current_user: dict = Depends(get_current_user)):
    """List all learning sessions for the authenticated user, newest first."""
    db = get_database()
    cursor = db.sessions.find({"user_id": current_user["id"]}).sort("started_at", -1)
    
    sessions = []
    async for doc in cursor:
        sessions.append(SessionResponse(
            id=str(doc["_id"]),
            user_id=doc["user_id"],
            content_id=doc["content_id"],
            content_title=doc.get("content_title"),
            started_at=doc["started_at"],
            ended_at=doc.get("ended_at"),
            duration_seconds=doc.get("duration_seconds", 0),
            status=doc.get("status", SessionStatus.ACTIVE),
            average_attention=doc.get("average_attention"),
            valid_readings_count=doc.get("valid_readings_count", 0),
            total_readings_count=doc.get("total_readings_count", 0)
        ))
    return sessions

@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(session_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve detailed session information including all chronological readings for graphing."""
    db = get_database()
    try:
        s_oid = ObjectId(session_id)
        session_doc = await db.sessions.find_one({"_id": s_oid})
    except Exception:
        session_doc = await db.sessions.find_one({"_id": session_id})
        
    if not session_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="סשן הלמידה לא נמצא.")
        
    if session_doc.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין לך הרשאה לצפות בסשן זה.")
        
    # Retrieve all readings
    readings_cursor = db.readings.find({"session_id": session_id}).sort("timestamp", 1)
    readings = []
    async for r in readings_cursor:
        readings.append(ReadingResponse(
            id=str(r["_id"]),
            session_id=r["session_id"],
            timestamp=r["timestamp"],
            attention_score=r.get("attention_score"),
            face_detected=r.get("face_detected", True),
            prediction_source=r.get("prediction_source", "simulation")
        ))
        
    return SessionDetailResponse(
        id=str(session_doc["_id"]),
        user_id=session_doc["user_id"],
        content_id=session_doc["content_id"],
        content_title=session_doc.get("content_title"),
        started_at=session_doc["started_at"],
        ended_at=session_doc.get("ended_at"),
        duration_seconds=session_doc.get("duration_seconds", 0),
        status=session_doc.get("status", SessionStatus.ACTIVE),
        average_attention=session_doc.get("average_attention"),
        valid_readings_count=session_doc.get("valid_readings_count", 0),
        total_readings_count=session_doc.get("total_readings_count", 0),
        readings=readings
    )
