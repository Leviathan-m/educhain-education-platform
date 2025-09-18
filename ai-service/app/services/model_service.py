"""
Model Service for managing ML models and their lifecycle
"""

import os
import asyncio
from typing import Dict, Any, Optional
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, AutoModelForSequenceClassification
import gc

from app.core.config import settings

class ModelService:
    """Service for managing machine learning models"""

    def __init__(self):
        self.models = {}
        self.tokenizers = {}
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_configs = {
            "text_generation": {
                "model_name": "microsoft/DialoGPT-medium",
                "max_length": 100,
                "temperature": 0.7
            },
            "text_classification": {
                "model_name": "microsoft/DialoGPT-medium",  # Placeholder - would use a classification model
                "labels": ["positive", "negative", "neutral"]
            },
            "sentiment_analysis": {
                "model_name": "cardiffnlp/twitter-roberta-base-sentiment-latest",
                "labels": ["negative", "neutral", "positive"]
            }
        }

    async def load_models(self):
        """Load all required models"""
        try:
            print(f"Loading models on device: {self.device}")

            # Create model cache directory
            os.makedirs(settings.MODEL_CACHE_DIR, exist_ok=True)

            # Load models asynchronously
            tasks = []
            for model_type, config in self.model_configs.items():
                tasks.append(self._load_model_async(model_type, config))

            await asyncio.gather(*tasks)

            print("All models loaded successfully")

        except Exception as e:
            print(f"Error loading models: {e}")
            # Continue with available models

    async def _load_model_async(self, model_type: str, config: Dict[str, Any]):
        """Load a single model asynchronously"""
        try:
            model_name = config["model_name"]

            # Use thread pool for model loading (since it's CPU intensive)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._load_model_sync,
                model_type,
                model_name,
                config
            )

            print(f"Loaded model: {model_type} ({model_name})")

        except Exception as e:
            print(f"Error loading model {model_type}: {e}")

    def _load_model_sync(self, model_type: str, model_name: str, config: Dict[str, Any]):
        """Synchronously load a model"""
        try:
            if model_type == "text_generation":
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                model = AutoModelForCausalLM.from_pretrained(model_name)

                # Add padding token if not present
                if tokenizer.pad_token is None:
                    tokenizer.pad_token = tokenizer.eos_token

                model.to(self.device)
                model.eval()

                self.tokenizers[model_type] = tokenizer
                self.models[model_type] = model

            elif model_type in ["text_classification", "sentiment_analysis"]:
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                model = AutoModelForSequenceClassification.from_pretrained(model_name)

                model.to(self.device)
                model.eval()

                self.tokenizers[model_type] = tokenizer
                self.models[model_type] = model

        except Exception as e:
            print(f"Error in synchronous model loading for {model_type}: {e}")
            raise

    async def unload_models(self):
        """Unload all models to free memory"""
        try:
            for model_type in list(self.models.keys()):
                if model_type in self.models:
                    del self.models[model_type]
                if model_type in self.tokenizers:
                    del self.tokenizers[model_type]

            # Clear GPU memory if available
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            # Force garbage collection
            gc.collect()

            print("All models unloaded")

        except Exception as e:
            print(f"Error unloading models: {e}")

    async def generate_text(
        self,
        prompt: str,
        model_type: str = "text_generation",
        max_length: int = 100,
        temperature: float = 0.7
    ) -> str:
        """Generate text using a language model"""
        if model_type not in self.models:
            return "Model not available"

        try:
            model = self.models[model_type]
            tokenizer = self.tokenizers[model_type]

            # Tokenize input
            inputs = tokenizer.encode(prompt, return_tensors="pt").to(self.device)

            # Generate text
            with torch.no_grad():
                outputs = model.generate(
                    inputs,
                    max_length=max_length,
                    temperature=temperature,
                    do_sample=True,
                    pad_token_id=tokenizer.eos_token_id,
                    num_return_sequences=1
                )

            # Decode output
            generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)

            # Remove the original prompt from the output
            if generated_text.startswith(prompt):
                generated_text = generated_text[len(prompt):].strip()

            return generated_text

        except Exception as e:
            print(f"Error generating text: {e}")
            return "Error generating response"

    async def classify_text(
        self,
        text: str,
        model_type: str = "text_classification"
    ) -> Dict[str, Any]:
        """Classify text using a classification model"""
        if model_type not in self.models:
            return {"error": "Model not available", "prediction": "unknown", "confidence": 0.0}

        try:
            model = self.models[model_type]
            tokenizer = self.tokenizers[model_type]

            # Tokenize input
            inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True).to(self.device)

            # Get predictions
            with torch.no_grad():
                outputs = model(**inputs)
                predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
                predicted_class = torch.argmax(predictions, dim=-1).item()
                confidence = predictions[0][predicted_class].item()

            # Get labels
            labels = self.model_configs.get(model_type, {}).get("labels", [])
            prediction = labels[predicted_class] if predicted_class < len(labels) else "unknown"

            return {
                "prediction": prediction,
                "confidence": round(confidence, 3),
                "all_probabilities": predictions[0].tolist()
            }

        except Exception as e:
            print(f"Error classifying text: {e}")
            return {"error": str(e), "prediction": "unknown", "confidence": 0.0}

    async def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment of text"""
        return await self.classify_text(text, "sentiment_analysis")

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about loaded models"""
        info = {
            "device": str(self.device),
            "loaded_models": list(self.models.keys()),
            "model_configs": self.model_configs
        }

        # Add memory usage info if available
        if torch.cuda.is_available():
            info["gpu_memory_allocated"] = torch.cuda.memory_allocated() / 1024**2  # MB
            info["gpu_memory_reserved"] = torch.cuda.memory_reserved() / 1024**2  # MB

        return info

    async def health_check(self) -> Dict[str, Any]:
        """Perform health check on models"""
        health = {
            "status": "healthy",
            "models_loaded": len(self.models),
            "total_models": len(self.model_configs),
            "model_status": {}
        }

        for model_type in self.model_configs.keys():
            health["model_status"][model_type] = model_type in self.models

        # Mark as unhealthy if no models are loaded
        if len(self.models) == 0:
            health["status"] = "unhealthy"

        return health

    async def reload_model(self, model_type: str) -> bool:
        """Reload a specific model"""
        if model_type not in self.model_configs:
            return False

        try:
            # Unload existing model
            if model_type in self.models:
                del self.models[model_type]
            if model_type in self.tokenizers:
                del self.tokenizers[model_type]

            # Reload model
            config = self.model_configs[model_type]
            await self._load_model_async(model_type, config)

            return True

        except Exception as e:
            print(f"Error reloading model {model_type}: {e}")
            return False
