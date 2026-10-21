from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.database.mongo import connect_to_mongo, close_mongo_connection, ping_database
from app.api.auth_router import router as auth_router
from app.api.content_router import router as content_router
from app.api.session_router import router as session_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB and build indexes
    await connect_to_mongo()
    yield
    # Shutdown: Cleanly close DB connection
    await close_mongo_connection()

app = FastAPI(
    title="FocusFlow API",
    description="מערכת מעקב קשב ולמידה מבוססת בינה מלאכותית ומצלמת רשת - שרת API",
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth_router)
app.include_router(content_router)
app.include_router(session_router)

@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint.
    Returns HTTP 200 when service is healthy and includes database connectivity status.
    """
    db_ok = await ping_database()
    response_data = {
        "status": "healthy",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": {
            "status": "connected" if db_ok else "disconnected",
            "url": settings.MONGODB_URL.split("@")[-1] if "@" in settings.MONGODB_URL else settings.MONGODB_URL
        },
        "simulation_mode": settings.ATTENTION_SIMULATION_MODE,
        "message_he": "שרת FocusFlow פועל בהצלחה"
    }
    return JSONResponse(status_code=status.HTTP_200_OK, content=response_data)

@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "ברוכים הבאים ל-FocusFlow API",
        "docs": "/docs",
        "health": "/health"
    }
