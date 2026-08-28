import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password


def _fernet():
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt_secret(secret):
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(value):
    try:
        return _fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def generate_totp_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def provisioning_uri(email, secret):
    issuer = "TALA-AI"
    label = quote(f"{issuer}:{email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"


def _totp(secret, timestamp=None):
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    counter = int((timestamp or time.time()) // 30)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def verify_totp(secret, code):
    normalized = str(code or "").replace(" ", "").strip()
    if not normalized.isdigit() or len(normalized) != 6:
        return False
    now = time.time()
    return any(hmac.compare_digest(_totp(secret, now + drift * 30), normalized) for drift in (-1, 0, 1))


def generate_recovery_codes(count=8):
    return [f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}" for _ in range(count)]


def hash_recovery_codes(codes):
    return [make_password(code) for code in codes]


def consume_recovery_code(profile, code):
    for index, encoded in enumerate(profile.mfa_recovery_codes):
        if check_password(str(code or "").strip().upper(), encoded):
            profile.mfa_recovery_codes = profile.mfa_recovery_codes[:index] + profile.mfa_recovery_codes[index + 1:]
            profile.save(update_fields=["mfa_recovery_codes"])
            return True
    return False
