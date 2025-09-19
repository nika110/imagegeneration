from fastapi import FastAPI, Request, Form, HTTPException, File, UploadFile
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import requests
import asyncio
import aiohttp
from typing import Optional, List
import json
import os
import uuid
import base64
from PIL import Image
import io
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

def validate_image_file(file: UploadFile) -> bool:
    """Validate uploaded image file"""
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]
    max_size = 10 * 1024 * 1024  # 10MB
    
    if file.content_type not in allowed_types:
        return False
    
    if file.size and file.size > max_size:
        return False
    
    return True

async def convert_image_to_base64(file: UploadFile) -> str:
    """Convert uploaded image to base64 format required by API"""
    try:
        # Read the file content
        content = await file.read()
        
        # Open with PIL to validate and potentially resize if needed
        image = Image.open(io.BytesIO(content))
        
        # Convert to RGB if necessary (for JPEG compatibility)
        if image.mode in ("RGBA", "P"):
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
            image = background
        
        # Save as JPEG to a bytes buffer
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        buffer.seek(0)
        
        # Encode to base64
        base64_string = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return f"data:image/jpeg;base64,{base64_string}"
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")
    finally:
        # Reset file position for potential re-reading
        await file.seek(0)

async def generate_images(prompt: str, max_images: int = 4, size: str = "2K", reference_image_url: str = None, reference_images: List[str] = None, session_id: str = None) -> dict:
    """
    Generate images using the AI API (async for concurrent support)
    
    Args:
        prompt: Text description for image generation
        max_images: Maximum number of images to generate (1-4)
        size: Image size (1K, 2K, 4K)
        reference_image_url: Optional URL to a reference image for image-to-image generation
        reference_images: Optional list of base64 encoded images for image-to-image generation
        session_id: Optional session identifier for tracking concurrent requests
    
    Returns:
        Dictionary containing API response
    """
    # Generate session ID if not provided
    if not session_id:
        session_id = str(uuid.uuid4())[:8]
    
    # Validate size parameter - support both Method 1 (1K, 2K, 4K) and Method 2 (WIDTHxHEIGHT)
    def validate_size(size_param):
        # Method 1: Resolution format (1K, 2K, 4K)
        if size_param in ["1K", "2K", "4K"]:
            return True
        
        # Method 2: Width x Height format (e.g., "2048x2048")
        if "x" in size_param:
            try:
                width, height = map(int, size_param.split("x"))
                
                # Validate total pixels range [1024x1024, 4096x4096]
                total_pixels = width * height
                min_pixels = 1024 * 1024  # 1,048,576
                max_pixels = 4096 * 4096  # 16,777,216
                
                if not (min_pixels <= total_pixels <= max_pixels):
                    return False
                
                # Validate aspect ratio [1/16, 16]
                aspect_ratio = width / height
                if not (1/16 <= aspect_ratio <= 16):
                    return False
                
                # Validate individual dimensions
                if not (1024 <= width <= 4096 and 1024 <= height <= 4096):
                    return False
                
                return True
            except (ValueError, ZeroDivisionError):
                return False
        
        return False
    
    if not validate_size(size):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid size '{size}'. Use Method 1 (1K, 2K, 4K) or Method 2 (WIDTHxHEIGHT, e.g., '2048x1536'). "
                   f"For Method 2: total pixels must be between 1024x1024 and 4096x4096, aspect ratio between 1/16 and 16."
        )
    
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
    
    # Add reference image(s) if provided
    # Priority: uploaded images > image URL
    if reference_images and len(reference_images) > 0:
        # For uploaded images, always send as list for API consistency
        # bytedance-seedream-4.0 supports multiple images, bytedance-seededit-3.0-i2 supports single
        data["image"] = reference_images  # Always as list for uploaded images
        print(f"Added {len(reference_images)} uploaded image(s) as list to API request")
    elif reference_image_url and reference_image_url.strip():
        data["image"] = reference_image_url.strip()  # URL as string
        print(f"Added image URL to API request: {reference_image_url[:50]}...")
    
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
    reference_image_url: str = Form(""),
    uploaded_images: List[UploadFile] = File(default=[])
):
    """API endpoint to generate images with concurrent support"""
    try:
        # Generate unique session ID for this request
        session_id = str(uuid.uuid4())[:8]
        
        # Process uploaded images
        reference_images = []
        for file in uploaded_images:
            if file.filename:  # Only process files that were actually uploaded
                if not validate_image_file(file):
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Invalid image file: {file.filename}. Supported formats: JPEG, PNG, WebP, GIF. Max size: 10MB."
                    )
                
                base64_image = await convert_image_to_base64(file)
                reference_images.append(base64_image)
        
        result = await generate_images(prompt, max_images, size, reference_image_url, reference_images, session_id)
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
    reference_image_url: str = Form(""),
    uploaded_images: List[UploadFile] = File(default=[])
):
    """JSON API endpoint for generating images with concurrent support"""
    try:
        # Generate unique session ID for this request
        session_id = str(uuid.uuid4())[:8]
        
        # Process uploaded images
        reference_images = []
        for file in uploaded_images:
            if file.filename:  # Only process files that were actually uploaded
                if not validate_image_file(file):
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Invalid image file: {file.filename}. Supported formats: JPEG, PNG, WebP, GIF. Max size: 10MB."
                    )
                
                base64_image = await convert_image_to_base64(file)
                reference_images.append(base64_image)
        
        result = await generate_images(prompt, max_images, size, reference_image_url, reference_images, session_id)
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