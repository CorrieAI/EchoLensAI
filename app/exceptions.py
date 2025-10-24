"""
Custom exception classes for EchoLens
Provides domain-specific exceptions for better error handling
"""


class EchoLensException(Exception):
    """Base exception for all EchoLens errors"""


class PodcastAlreadyExistsError(EchoLensException):
    """Raised when attempting to add a podcast that already exists"""


class FeedParseError(EchoLensException):
    """Raised when RSS feed parsing fails"""


class ProcessingError(EchoLensException):
    """Raised during episode processing (transcription, extraction, etc.)"""


class NotFoundError(EchoLensException):
    """Raised when a requested resource is not found"""


class TranscriptionError(ProcessingError):
    """Raised when audio transcription fails"""


class TermExtractionError(ProcessingError):
    """Raised when term extraction fails"""


class SummarizationError(ProcessingError):
    """Raised when summary generation fails"""


class VectorStoreError(ProcessingError):
    """Raised when vector storage/search fails"""


class AudioDownloadError(ProcessingError):
    """Raised when audio download fails"""


class DatabaseError(EchoLensException):
    """Raised when database operations fail"""


class ValidationError(EchoLensException):
    """Raised when input validation fails"""
