"""
Health check API routes
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime
import psutil
import platform

from app.services.model_service import ModelService
from app.core.config import settings

router = APIRouter()

# Initialize services for health checks
model_service = ModelService()

@router.get("/health")
async def health_check():
    """
    Basic health check endpoint
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "AI Evaluation Service",
        "version": "1.0.0"
    }

@router.get("/health/detailed")
async def detailed_health_check():
    """
    Detailed health check with system and model status
    """
    try:
        # System information
        system_info = {
            "platform": platform.system(),
            "platform_version": platform.version(),
            "python_version": platform.python_version(),
            "cpu_count": psutil.cpu_count(),
            "memory_total": psutil.virtual_memory().total,
            "memory_available": psutil.virtual_memory().available,
            "disk_usage": psutil.disk_usage('/').percent
        }

        # Model health
        model_health = await model_service.health_check()

        # Service status
        service_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "uptime": "N/A",  # Would need to track from startup
            "environment": "development" if settings.DEBUG else "production"
        }

        # Overall status
        overall_status = "healthy"
        if model_health.get("models_loaded", 0) == 0:
            overall_status = "degraded"
        if model_health.get("status") == "unhealthy":
            overall_status = "unhealthy"

        return {
            "overall_status": overall_status,
            "service": service_status,
            "system": system_info,
            "models": model_health,
            "config": {
                "api_port": settings.API_PORT,
                "debug_mode": settings.DEBUG,
                "model_cache_dir": settings.MODEL_CACHE_DIR
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Health check failed: {str(e)}"
        )

@router.get("/health/models")
async def model_health_check():
    """
    Check the status of loaded ML models
    """
    try:
        model_info = model_service.get_model_info()
        health = await model_service.health_check()

        return {
            "status": health["status"],
            "models_loaded": health["models_loaded"],
            "total_models": health["total_models"],
            "model_details": model_info,
            "model_status": health["model_status"]
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "models_loaded": 0,
            "total_models": len(model_service.model_configs)
        }

@router.get("/health/dependencies")
async def dependency_check():
    """
    Check if required dependencies are available
    """
    dependencies = {
        "torch": {"available": False, "version": None},
        "transformers": {"available": False, "version": None},
        "sentence_transformers": {"available": False, "version": None},
        "spacy": {"available": False, "version": None},
        "nltk": {"available": False, "version": None}
    }

    try:
        import torch
        dependencies["torch"]["available"] = True
        dependencies["torch"]["version"] = torch.__version__

        import transformers
        dependencies["transformers"]["available"] = True
        dependencies["transformers"]["version"] = transformers.__version__

        import sentence_transformers
        dependencies["sentence_transformers"]["available"] = True
        dependencies["sentence_transformers"]["version"] = sentence_transformers.__version__

        import spacy
        dependencies["spacy"]["available"] = True
        dependencies["spacy"]["version"] = spacy.__version__

        import nltk
        dependencies["nltk"]["available"] = True
        dependencies["nltk"]["version"] = nltk.__version__

    except ImportError as e:
        # Dependencies are checked during import
        pass

    # Check overall status
    all_available = all(dep["available"] for dep in dependencies.values())
    status = "healthy" if all_available else "degraded"

    return {
        "status": status,
        "dependencies": dependencies,
        "all_dependencies_available": all_available
    }
