"""
NLP Service for text analysis and evaluation
"""

import re
import nltk
from typing import List, Dict, Any, Tuple
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from textblob import TextBlob
import spacy

from app.core.config import settings

class NLPService:
    """Natural Language Processing Service"""

    def __init__(self):
        self.sentence_transformer = None
        self.nlp = None
        self._download_nltk_data()

    def _download_nltk_data(self):
        """Download required NLTK data"""
        try:
            nltk.download('punkt', quiet=True)
            nltk.download('stopwords', quiet=True)
            nltk.download('wordnet', quiet=True)
        except Exception as e:
            print(f"Warning: Could not download NLTK data: {e}")

    async def load_models(self):
        """Load NLP models"""
        try:
            self.sentence_transformer = SentenceTransformer(settings.SENTENCE_TRANSFORMER_MODEL)
            self.nlp = spacy.load("en_core_web_sm")
            print("NLP models loaded successfully")
        except Exception as e:
            print(f"Warning: Could not load NLP models: {e}")
            # Fallback to basic functionality
            self.sentence_transformer = None
            self.nlp = None

    def preprocess_text(self, text: str) -> str:
        """Preprocess text for analysis"""
        if not text:
            return ""

        # Convert to lowercase
        text = text.lower()

        # Remove special characters and extra whitespace
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text)

        return text.strip()

    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate semantic similarity between two texts"""
        if not self.sentence_transformer:
            # Fallback to basic similarity
            return self._basic_similarity(text1, text2)

        try:
            # Preprocess texts
            text1_processed = self.preprocess_text(text1)
            text2_processed = self.preprocess_text(text2)

            # Generate embeddings
            embeddings1 = self.sentence_transformer.encode([text1_processed])
            embeddings2 = self.sentence_transformer.encode([text2_processed])

            # Calculate cosine similarity
            similarity = cosine_similarity(embeddings1, embeddings2)[0][0]

            return float(similarity)

        except Exception as e:
            print(f"Error calculating similarity: {e}")
            return self._basic_similarity(text1, text2)

    def _basic_similarity(self, text1: str, text2: str) -> float:
        """Basic similarity calculation as fallback"""
        text1_words = set(self.preprocess_text(text1).split())
        text2_words = set(self.preprocess_text(text2).split())

        if not text1_words and not text2_words:
            return 1.0

        if not text1_words or not text2_words:
            return 0.0

        intersection = text1_words.intersection(text2_words)
        union = text1_words.union(text2_words)

        return len(intersection) / len(union)

    def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment of text"""
        try:
            blob = TextBlob(text)
            return {
                "polarity": blob.sentiment.polarity,  # -1 to 1
                "subjectivity": blob.sentiment.subjectivity,  # 0 to 1
                "sentiment": "positive" if blob.sentiment.polarity > 0.1
                           else "negative" if blob.sentiment.polarity < -0.1
                           else "neutral"
            }
        except Exception as e:
            print(f"Error analyzing sentiment: {e}")
            return {
                "polarity": 0.0,
                "subjectivity": 0.5,
                "sentiment": "neutral"
            }

    def extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """Extract keywords from text"""
        if not self.nlp:
            # Fallback to basic keyword extraction
            return self._basic_keyword_extraction(text, max_keywords)

        try:
            doc = self.nlp(text)

            # Extract noun phrases and important words
            keywords = []

            # Get noun chunks
            for chunk in doc.noun_chunks:
                if len(chunk.text.split()) <= 3:  # Limit to short phrases
                    keywords.append(chunk.text.lower())

            # Get named entities
            for ent in doc.ents:
                if ent.label_ in ['PERSON', 'ORG', 'GPE', 'PRODUCT', 'EVENT']:
                    keywords.append(ent.text.lower())

            # Remove duplicates and sort by frequency
            keyword_counts = {}
            for keyword in keywords:
                keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1

            sorted_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)
            return [keyword for keyword, count in sorted_keywords[:max_keywords]]

        except Exception as e:
            print(f"Error extracting keywords: {e}")
            return self._basic_keyword_extraction(text, max_keywords)

    def _basic_keyword_extraction(self, text: str, max_keywords: int) -> List[str]:
        """Basic keyword extraction as fallback"""
        words = re.findall(r'\b\w+\b', text.lower())
        stop_words = set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'])

        filtered_words = [word for word in words if word not in stop_words and len(word) > 2]

        # Count word frequencies
        word_counts = {}
        for word in filtered_words:
            word_counts[word] = word_counts.get(word, 0) + 1

        # Return most frequent words
        sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        return [word for word, count in sorted_words[:max_keywords]]

    def evaluate_answer_quality(self, answer: str, question: str) -> Dict[str, Any]:
        """Evaluate the quality of an answer"""
        evaluation = {
            "score": 0.0,
            "confidence": 0.0,
            "criteria": {
                "relevance": 0.0,
                "completeness": 0.0,
                "accuracy": 0.0,
                "clarity": 0.0
            },
            "feedback": []
        }

        try:
            # Calculate relevance (similarity to question)
            relevance = self.calculate_similarity(answer, question)
            evaluation["criteria"]["relevance"] = relevance

            # Analyze completeness (length and content depth)
            word_count = len(answer.split())
            completeness = min(word_count / 50, 1.0)  # Expect at least 50 words
            evaluation["criteria"]["completeness"] = completeness

            # Analyze clarity (sentiment and readability)
            sentiment = self.analyze_sentiment(answer)
            clarity = 1.0 - abs(sentiment["polarity"])  # Less emotional = clearer
            evaluation["criteria"]["clarity"] = clarity

            # Basic accuracy check (this would need domain-specific models)
            evaluation["criteria"]["accuracy"] = 0.8  # Placeholder

            # Calculate overall score
            weights = {
                "relevance": 0.4,
                "completeness": 0.3,
                "accuracy": 0.2,
                "clarity": 0.1
            }

            total_score = sum(
                evaluation["criteria"][criterion] * weight
                for criterion, weight in weights.items()
            )

            evaluation["score"] = round(total_score, 2)
            evaluation["confidence"] = 0.85  # Placeholder

            # Generate feedback
            evaluation["feedback"] = self._generate_feedback(evaluation["criteria"])

        except Exception as e:
            print(f"Error evaluating answer quality: {e}")
            evaluation["score"] = 0.5
            evaluation["confidence"] = 0.5
            evaluation["feedback"] = ["평가를 처리하는 중 오류가 발생했습니다."]

        return evaluation

    def _generate_feedback(self, criteria: Dict[str, float]) -> List[str]:
        """Generate feedback based on evaluation criteria"""
        feedback = []

        if criteria["relevance"] < 0.6:
            feedback.append("답변이 질문과 덜 관련이 있습니다. 질문의 요점을 더 직접적으로 다루어보세요.")

        if criteria["completeness"] < 0.7:
            feedback.append("답변이 좀 더 자세할 수 있습니다. 추가적인 설명이나 예시를 포함해보세요.")

        if criteria["clarity"] < 0.8:
            feedback.append("답변의 명확성을 높여보세요. 간단하고 직관적인 언어를 사용하세요.")

        if criteria["accuracy"] < 0.8:
            feedback.append("정확성을 확인해주세요. 사실에 기반한 답변인지 검토해보세요.")

        if not feedback:
            feedback.append("좋은 답변입니다! 계속 좋은 성과를 유지하세요.")

        return feedback
