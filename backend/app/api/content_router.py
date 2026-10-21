from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from app.database.mongo import get_database
from app.models.content import ContentCreateRequest, ContentResponse
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/content", tags=["Content Library"])

@router.post("", response_model=ContentResponse, status_code=status.HTTP_201_CREATED)
async def create_content(payload: ContentCreateRequest, current_user: dict = Depends(get_current_user)):
    """Add new learning content (text or YouTube video) owned by the current user."""
    db = get_database()
    
    doc = {
        "user_id": current_user["id"],
        "title": payload.title.strip(),
        "content_type": payload.content_type.value,
        "text": payload.text.strip() if payload.text else None,
        "url": payload.url.strip() if payload.url else None,
        "created_at": datetime.utcnow()
    }
    
    result = await db.content.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return doc

@router.get("", response_model=List[ContentResponse])
async def list_user_content(current_user: dict = Depends(get_current_user)):
    """List all learning content belonging strictly to the authenticated user."""
    db = get_database()
    cursor = db.content.find({"user_id": current_user["id"]}).sort("created_at", -1)
    
    items = []
    async for doc in cursor:
        items.append(ContentResponse(
            id=str(doc["_id"]),
            user_id=doc["user_id"],
            title=doc["title"],
            content_type=doc["content_type"],
            text=doc.get("text"),
            url=doc.get("url"),
            created_at=doc.get("created_at", datetime.utcnow())
        ))
    return items

@router.get("/{content_id}", response_model=ContentResponse)
async def get_content_item(content_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve a single content item, strictly verifying ownership."""
    db = get_database()
    try:
        obj_id = ObjectId(content_id)
        doc = await db.content.find_one({"_id": obj_id})
    except Exception:
        doc = await db.content.find_one({"_id": content_id})
        
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="חומר הלמידה המבוקש לא נמצא.")
        
    if doc.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="חומר הלמידה המבוקש לא נמצא.")
        
    return ContentResponse(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        title=doc["title"],
        content_type=doc["content_type"],
        text=doc.get("text"),
        url=doc.get("url"),
        created_at=doc.get("created_at", datetime.utcnow())
    )

@router.delete("/{content_id}", status_code=status.HTTP_200_OK)
async def delete_content_item(content_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a content item, verifying ownership."""
    db = get_database()
    try:
        obj_id = ObjectId(content_id)
        doc = await db.content.find_one({"_id": obj_id})
    except Exception:
        doc = await db.content.find_one({"_id": content_id})
        
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="חומר הלמידה המבוקש לא נמצא.")
        
    if doc.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="חומר הלמידה המבוקש לא נמצא.")
        
    try:
        await db.content.delete_one({"_id": doc["_id"]})
    except Exception:
        await db.content.delete_one({"_id": content_id})
        
    return {"message": "חומר הלמידה נמחק בהצלחה", "id": content_id}
