from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os
import requests
import base64
from typing import Optional

load_dotenv()

app = FastAPI()

GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"

@app.post("/generate_image")
async def generate_image(
    prompt: str = Form(...),
    apikey: str = Form(...),
    reference_image_url: Optional[str] = Form(None)
):
    if not apikey:
        raise HTTPException(status_code=400, detail="API key is required.")

    headers = {
        "x-goog-api-key": apikey,
        "Content-Type": "application/json"
    }

    parts = []
    parts.append({"text": prompt})

    if reference_image_url:
        try:
            response = requests.get(reference_image_url)
            response.raise_for_status()
            image_data = response.content
            encoded_image = base64.b64encode(image_data).decode("utf-8")
            mime_type = response.headers.get("Content-Type", "image/jpeg")

            parts.append({
                "inline_data": {
                    "mime_type": mime_type,
                    "data": encoded_image
                }
            })
        except requests.exceptions.RequestException as e:
            raise HTTPException(status_code=400, detail=f"Failed to download reference image: {e}")

    payload = {
        "contents": [{
            "parts": parts
        }]
    }

    try:
        gemini_response = requests.post(GEMINI_API_BASE_URL, headers=headers, json=payload)
        gemini_response.raise_for_status()
        response_data = gemini_response.json()

        if response_data and "candidates" in response_data and response_data["candidates"]:
            first_candidate = response_data["candidates"][0]
            if "content" in first_candidate and "parts" in first_candidate["content"]:
                for part in first_candidate["content"]["parts"]:
                    if "inline_data" in part and "data" in part["inline_data"]:
                        generated_image_base64 = part["inline_data"]["data"]
                        dummy_image_url = f"data:{part["inline_data"]["mime_type"]};base64,{generated_image_base64}"
                        return JSONResponse(content={
                            "image_url": dummy_image_url,
                            "message": "Image generated successfully. In a real application, this base64 data would be uploaded to an image hosting service to get a public URL."
                        })
        
        raise HTTPException(status_code=500, detail="Failed to extract image data from Gemini API response.")

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Gemini API request failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
  
