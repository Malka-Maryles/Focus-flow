import os
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FocusFlow"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Server
    HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    
    # Database
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017/focusflow")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "focusflow")
    
    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "focusflow_default_development_secret_key_min_32_chars_12345")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # CORS — accepts either a JSON array or a comma-separated string from env
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            # Handle comma-separated string from env var
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v
    
    # Attention Inference & Pipeline
    ATTENTION_SIMULATION_MODE: bool = os.getenv("ATTENTION_SIMULATION_MODE", "true").lower() in ("true", "1", "yes")
    ONNX_MODEL_PATH: str = os.getenv("ONNX_MODEL_PATH", "./models/attention_model.onnx")

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
