"""
Security validators for EchoLens
Provides validation functions to prevent security vulnerabilities
"""

import ipaddress
import socket
from urllib.parse import urlparse

from app.exceptions import ValidationError

# Blocked IP ranges for SSRF prevention
BLOCKED_IP_RANGES = [
    ipaddress.ip_network("127.0.0.0/8"),  # Loopback
    ipaddress.ip_network("10.0.0.0/8"),  # Private
    ipaddress.ip_network("172.16.0.0/12"),  # Private
    ipaddress.ip_network("192.168.0.0/16"),  # Private
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local (AWS metadata)
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 private
]

ALLOWED_URL_SCHEMES = ["http", "https"]


def validate_external_url(url: str) -> bool:
    """
    Validate that a URL is safe for external fetching.
    Prevents SSRF attacks by blocking internal IPs and invalid schemes.

    Args:
        url: The URL to validate

    Returns:
        True if valid

    Raises:
        ValidationError: If URL is invalid or points to blocked resource
    """
    try:
        parsed = urlparse(url)

        # Check scheme
        if parsed.scheme not in ALLOWED_URL_SCHEMES:
            raise ValidationError(
                f"Invalid URL scheme: {parsed.scheme}. Only {ALLOWED_URL_SCHEMES} are allowed."
            )

        # Check hostname exists
        if not parsed.netloc:
            raise ValidationError("URL must have a hostname")

        # Extract hostname (remove port if present)
        hostname = parsed.netloc.split(":")[0]

        # Resolve hostname to IP
        try:
            ip = socket.gethostbyname(hostname)
        except socket.gaierror:
            raise ValidationError(f"Could not resolve hostname: {hostname}")

        # Convert to IP object
        try:
            ip_obj = ipaddress.ip_address(ip)
        except ValueError:
            raise ValidationError(f"Invalid IP address: {ip}")

        # Check if IP is in blocked ranges
        for blocked_range in BLOCKED_IP_RANGES:
            if ip_obj in blocked_range:
                raise ValidationError(
                    f"Access to internal/private IP ranges is forbidden. "
                    f"URL resolves to {ip} which is in blocked range {blocked_range}"
                )

        return True

    except ValidationError:
        raise
    except Exception as e:
        raise ValidationError(f"URL validation failed: {e!s}")


def validate_filename(filename: str, allowed_extensions: list[str] = None) -> bool:
    """
    Validate that a filename is safe and doesn't contain path traversal.

    Args:
        filename: The filename to validate
        allowed_extensions: Optional list of allowed file extensions

    Returns:
        True if valid

    Raises:
        ValidationError: If filename is invalid
    """
    if not filename:
        raise ValidationError("Filename cannot be empty")

    # Check for path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        raise ValidationError("Filename contains invalid characters (path traversal attempt)")

    # Check for null bytes
    if "\x00" in filename:
        raise ValidationError("Filename contains null bytes")

    # Check extension if provided
    if allowed_extensions:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in allowed_extensions:
            raise ValidationError(
                f"File extension .{ext} not allowed. Allowed: {allowed_extensions}"
            )

    return True
