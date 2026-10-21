from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Response, Depends
from bson import ObjectId
from app.database.mongo import get_database
from app.models.user import UserRegisterRequest, UserLoginRequest, UserResponse, TokenResponse
from app.auth.security import hash_password, verify_password, create_access_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest, response: Response):
    """
    Register a new user with email, password (min 8 chars) and display name.
    Rejects duplicate emails, securely hashes password, and returns access token.
    """
    db = get_database()
    email_clean = payload.email.lower().strip()
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": email_clean})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="כתובת האימייל כבר קיימת במערכת. אנא התחבר במקום להירשם שוב."
        )
        
    hashed_pwd = hash_password(payload.password)
    new_user_doc = {
        "email": email_clean,
        "password_hash": hashed_pwd,
        "display_name": payload.display_name.strip(),
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(new_user_doc)
    user_id_str = str(result.inserted_id)
    
    user_resp = UserResponse(
        id=user_id_str,
        email=email_clean,
        display_name=payload.display_name.strip(),
        created_at=new_user_doc["created_at"]
    )
    
    token = create_access_token(data={"sub": user_id_str, "email": email_clean})
    
    # Set HttpOnly cookie as an additional layer of security
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=86400 * 7,
        samesite="lax",
        secure=False # Set to True in production with HTTPS
    )
    
    return TokenResponse(access_token=token, token_type="bearer", user=user_resp)

@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLoginRequest, response: Response):
    """
    Authenticate user with email and password.
    Returns JWT token and sets HttpOnly cookie.
    """
    db = get_database()
    email_clean = payload.email.lower().strip()
    
    user = await db.users.find_one({"email": email_clean})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="כתובת אימייל או סיסמה שגויים. אנא נסה שוב.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user_id_str = str(user["_id"])
    token = create_access_token(data={"sub": user_id_str, "email": email_clean})
    
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=86400 * 7,
        samesite="lax",
        secure=False
    )
    
    user_resp = UserResponse(
        id=user_id_str,
        email=user["email"],
        display_name=user.get("display_name", ""),
        created_at=user.get("created_at", datetime.utcnow())
    )
    
    return TokenResponse(access_token=token, token_type="bearer", user=user_resp)

@router.post("/logout")
async def logout(response: Response):
    """Clear session cookie and log out user."""
    response.delete_cookie(key="access_token")
    return {"message": "התנתקת בהצלחה מהמערכת", "status": "success"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        display_name=current_user["display_name"],
        created_at=current_user["created_at"] or datetime.utcnow()
    )
