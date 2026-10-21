from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class UserRegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="כתובת דואר אלקטרוני תקינה")
    password: str = Field(..., min_length=8, description="סיסמה באורך של לפחות 8 תווים")
    display_name: str = Field(..., min_length=2, max_length=50, description="שם תצוגה של המשתמש")

class UserLoginRequest(BaseModel):
    email: EmailStr = Field(..., description="כתובת אימייל רשומה")
    password: str = Field(..., description="סיסמת המשתמש")

class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
