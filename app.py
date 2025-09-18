from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import requests
import asyncio
import aiohttp
from typing import Optional
import json
import os
import uuid
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Image Generation App", description="Generate images using AI prompts")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# API configuration from environment variables
API_KEY = os.getenv("API_KEY")
API_URL = os.getenv("API_URL")
API_MODEL = os.getenv("API_MODEL", "seedream-4-0-250828")

# Validate required environment variables
if not API_KEY:
    raise ValueError("API_KEY environment variable is required")
if not API_URL:
    raise ValueError("API_URL environment variable is required")

async def generate_images(prompt: str, max_images: int = 4, size: str = "2K", reference_image_url: str = None, session_id: str = None) -> dict:
    """
    Generate images using the AI API (async for concurrent support)
    
    Args:
        prompt: Text description for image generation
        max_images: Maximum number of images to generate (1-4)
        size: Image size (1K, 2K, 4K)
        reference_image_url: Optional URL to a reference image for image-to-image generation
        session_id: Optional session identifier for tracking concurrent requests
    
    Returns:
        Dictionary containing API response
    """
    # Generate session ID if not provided
    if not session_id:
        session_id = str(uuid.uuid4())[:8]
    
    # Validate size parameter
    valid_sizes = ["1K", "2K", "4K"]
    if size not in valid_sizes:
        raise HTTPException(status_code=400, detail=f"Invalid size '{size}'. Valid sizes are: {', '.join(valid_sizes)}")
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
        "X-Session-ID": session_id  # Add session tracking
    }
    
    data = {
        "model": API_MODEL,
        "prompt": prompt,
        "sequential_image_generation": "auto",
        "sequential_image_generation_options": {
            "max_images": max_images
        },
        "response_format": "url",
        "size": size,
        "stream": False,
        "watermark": False
    }
    
    # Add reference image if provided
    if reference_image_url and reference_image_url.strip():
        data["image"] = reference_image_url.strip()
    
    try:
        # Use aiohttp for async requests to support concurrent users
        async with aiohttp.ClientSession() as session:
            async with session.post(API_URL, headers=headers, json=data) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    raise HTTPException(status_code=response.status, detail=f"API request failed: {error_text}")
                
                result = await response.json()
                # Add session info to response
                result['session_id'] = session_id
                return result
                
    except aiohttp.ClientError as e:
        raise HTTPException(status_code=500, detail=f"API request failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve the main page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health_check():
    """Health check endpoint to verify service status"""
    try:
        # Check if we can reach the AI API
        test_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
        
        # Make a minimal request to test API connectivity
        # Using a very short timeout to avoid long waits
        response = requests.get(
            API_URL.replace('/generations', '/models'),  # Try to get models endpoint
            headers=test_headers,
            timeout=5
        )
        
        api_status = "healthy" if response.status_code < 500 else "degraded"
        
    except Exception:
        api_status = "unhealthy"
    
    return {
        "status": "healthy",
        "api_status": api_status,
        "timestamp": requests.utils.default_headers()
    }

@app.post("/generate")
async def generate_image_endpoint(
    request: Request,
    prompt: str = Form(...),
    max_images: int = Form(4),
    size: str = Form("2K"),
    reference_image_url: str = Form("")
):
    """API endpoint to generate images with concurrent support"""
    try:
        # Generate unique session ID for this request
        session_id = str(uuid.uuid4())[:8]
        
        result = await generate_images(prompt, max_images, size, reference_image_url, session_id)
        return {"success": True, "data": result, "session_id": session_id}
    except HTTPException as e:
        return {"success": False, "error": e.detail}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {str(e)}"}

@app.post("/api/generate")
async def api_generate_image(
    request: Request,
    prompt: str = Form(...),
    max_images: int = Form(4),
    size: str = Form("2K"),
    reference_image_url: str = Form("")
):
    """JSON API endpoint for generating images with concurrent support"""
    try:
        # Generate unique session ID for this request
        session_id = str(uuid.uuid4())[:8]
        
        result = await generate_images(prompt, max_images, size, reference_image_url, session_id)
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Get host and port from environment variables
    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", 8000))
    uvicorn.run(app, host=host, port=port)