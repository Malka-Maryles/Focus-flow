from typing import Dict, Any, Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from app.auth.security import decode_access_token
from app.database.mongo import get_database

security_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
) -> Dict[str, Any]:
    """
    Authenticate request via Authorization header (Bearer token) or HttpOnly cookie.
    Validates token signature and returns the authenticated user from the database.
    """
    token: Optional[str] = None
    
    if credentials:
        token = credentials.credentials
    elif "access_token" in request.cookies:
        token = request.cookies.get("access_token")
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="נדרשת התחברות למערכת. לא סופק מפתח גישה תקף.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="טוקן האימות פג תוקף או אינו תקף. אנא התחבר מחדש.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="מבנה מזהה משתמש בטוקן אינו תקין.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    db = get_database()
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = await db.users.find_one({"_id": user_id})
        
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="המשתמש המבוקש אינו קיים במערכת.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "display_name": user.get("display_name", ""),
        "created_at": user.get("created_at")
    }
