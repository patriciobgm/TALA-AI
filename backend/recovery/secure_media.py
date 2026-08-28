from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner


SIGNING_SALT = "tala.protected-media"


def create_media_token(kind, object_id, user_id):
    value = f"{kind}:{object_id}:{user_id}"
    return TimestampSigner(salt=SIGNING_SALT).sign(value)


def validate_media_token(token, kind, object_id):
    if not token:
        return False
    try:
        value = TimestampSigner(salt=SIGNING_SALT).unsign(
            token,
            max_age=getattr(settings, "PROTECTED_MEDIA_URL_TTL", 900),
        )
    except (BadSignature, SignatureExpired):
        return False
    try:
        token_kind, token_object_id, _user_id = value.split(":", 2)
    except ValueError:
        return False
    return token_kind == kind and token_object_id == str(object_id)
